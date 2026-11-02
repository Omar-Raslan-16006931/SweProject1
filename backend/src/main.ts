import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { globalValidationPipe } from './common/pipes/validation';
import { setupSwagger } from './swagger';

function assertEnv(config: ConfigService) {
  const missing = [
    ['MONGODB_URI', config.get('mongodbUri')],
    ['JWT_ACCESS_SECRET', config.get('jwt.accessSecret')],
    ['JWT_REFRESH_SECRET', config.get('jwt.refreshSecret')],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}. Copy .env.example to .env and fill them in.`);
  }
}

async function bootstrap() {
  // rawBody is required to verify Stripe webhook signatures (PAY-01).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const config = app.get(ConfigService);
  assertEnv(config);

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableCors({ origin: config.get<string>('frontendUrl'), credentials: true });
  app.useGlobalPipes(globalValidationPipe);
  app.useGlobalFilters(new AllExceptionsFilter());

  // GEN-08: uploaded images are stored on the server and served by URL.
  const uploadsDir = resolve(config.get<string>('uploadsDir') ?? 'uploads');
  mkdirSync(uploadsDir, { recursive: true });
  app.useStaticAssets(uploadsDir, { prefix: '/uploads', index: false, dotfiles: 'deny' });

  setupSwagger(app);

  const port = config.get<number>('port') ?? 3001;
  await app.listen(port);
  Logger.log(`API ready on http://localhost:${port}/api  |  Swagger UI: http://localhost:${port}/api/docs`, 'Bootstrap');
}
bootstrap();
