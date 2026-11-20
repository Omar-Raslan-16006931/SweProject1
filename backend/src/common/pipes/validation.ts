import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';

function flatten(errors: ValidationError[], parent = ''): { field: string; messages: string[] }[] {
  const out: { field: string; messages: string[] }[] = [];
  for (const e of errors) {
    const field = parent ? `${parent}.${e.property}` : e.property;
    if (e.constraints) out.push({ field, messages: Object.values(e.constraints) });
    if (e.children?.length) out.push(...flatten(e.children, field));
  }
  return out;
}

/** GEN-02 / GEN-13: server-side validation with field-level messages. */
export const globalValidationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  exceptionFactory: (errors) =>
    new BadRequestException({ message: 'Validation failed', errors: flatten(errors) }),
});
