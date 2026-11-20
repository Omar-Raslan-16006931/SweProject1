import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function buildOpenApi(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Travel Planning and Booking Platform API')
    .setDescription(
      [
        'Software Project I (Winter 2026) - Milestone 1 backend (NestJS + MongoDB Atlas).',
        '',
        '**Authentication:** call `POST /api/auth/login`. The server sets httpOnly `access_token` and `refresh_token` cookies',
        '(ACC-19); Swagger UI sends them automatically on later requests. When the access token expires call `POST /api/auth/refresh`.',
        'A session expires after 30 minutes without authenticated requests (ACC-06).',
        '',
        'Every operation summary lists the requirement IDs it satisfies. Lists are paginated with page size 10 (GEN-05).',
        'Errors share one shape: `{ statusCode, error, message, errors?, path, timestamp }`.',
      ].join('\n'),
    )
    .setVersion('1.0.0')
    .addCookieAuth('access_token', { type: 'apiKey', in: 'cookie', name: 'access_token' })
    .build();
  return SwaggerModule.createDocument(app, config);
}

export function setupSwagger(app: INestApplication) {
  const document = buildOpenApi(app);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { withCredentials: true, persistAuthorization: true, tagsSorter: 'alpha', docExpansion: 'none' },
    customSiteTitle: 'Travel Platform API',
  });
  return document;
}
