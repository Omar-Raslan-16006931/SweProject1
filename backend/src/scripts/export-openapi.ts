/**
 * Writes the OpenAPI document to docs/api/openapi.json without starting the HTTP server.
 * Usage: npm run export:openapi   (needs MONGODB_URI etc. because the app context connects to the database)
 */
import { NestFactory } from '@nestjs/core';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { AppModule } from '../app.module';
import { buildOpenApi } from '../swagger';

async function run() {
  const app = await NestFactory.create(AppModule, { logger: ['error'], rawBody: true });
  app.setGlobalPrefix('api');
  const doc = buildOpenApi(app);
  const out = resolve(__dirname, '../../../docs/api');
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, 'openapi.json'), JSON.stringify(doc, null, 2));
  console.log(`OpenAPI written to ${resolve(out, 'openapi.json')}`);
  await app.close();
  process.exit(0);
}
run();
