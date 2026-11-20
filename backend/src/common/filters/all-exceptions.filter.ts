import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { isDuplicateKeyError } from '../utils/errors';

/**
 * GEN-13 / PDF 6.7: consistent error responses for every failure.
 * Shape: { statusCode, error, message, errors?, path, timestamp }
 *  - `errors` holds field-level validation messages ({ field, messages[] }) for GEN-02.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string = 'Internal server error';
    let errors: unknown;
    let code: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse() as any;
      if (typeof body === 'string') {
        message = body;
      } else {
        message = Array.isArray(body.message) ? 'Validation failed' : body.message ?? exception.message;
        errors = body.errors ?? (Array.isArray(body.message) ? body.message : undefined);
        code = body.code;
        if (body.field && !errors) errors = [{ field: body.field, messages: [message] }];
      }
      // GEN-08: uploads outside the limits are rejected with a clear error (multer reports only "File too large").
      if (status === HttpStatus.PAYLOAD_TOO_LARGE) message = 'Image exceeds the 5 MB limit';
    } else if (isDuplicateKeyError(exception)) {
      status = HttpStatus.CONFLICT;
      message = 'A record with the same unique value already exists';
    } else if ((exception as any)?.name === 'CastError') {
      status = HttpStatus.BAD_REQUEST;
      message = `Invalid value for ${(exception as any).path}`;
    } else if ((exception as any)?.name === 'ValidationError') {
      status = HttpStatus.BAD_REQUEST;
      message = 'Validation failed';
      errors = Object.values((exception as any).errors ?? {}).map((e: any) => ({
        field: e.path,
        messages: [e.message],
      }));
    } else if ((exception as any)?.name === 'VersionError') {
      // Two requests edited the same document at once; the loser must retry (never a 500).
      status = HttpStatus.CONFLICT;
      message = 'This item was changed by another request at the same time. Please retry.';
      code = 'CONCURRENT_UPDATE';
    } else if (
      typeof (exception as any)?.status === 'number' && (exception as any).status >= 400 && (exception as any).status < 500 &&
      typeof (exception as any)?.type === 'string'
    ) {
      // body-parser errors (e.g. entity.too.large, entity.parse.failed) are client errors, not 500s.
      status = (exception as any).status;
      message = (exception as any).type === 'entity.too.large' ? 'Request body is too large' : 'Malformed request body';
    } else if ((exception as any)?.code === 'LIMIT_FILE_SIZE') {
      status = HttpStatus.BAD_REQUEST;
      message = 'Image exceeds the 5 MB limit';
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    res.status(status).json({
      statusCode: status,
      error: HttpStatus[status] ?? 'Error',
      ...(code ? { code } : {}),
      message,
      ...(errors ? { errors } : {}),
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
