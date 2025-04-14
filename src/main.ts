import { NestFactory } from '@nestjs/core';

import { AppModule } from './app/app.module';
import { validateEnvironmentVariables } from './app/utils/validate-environment-variables';

async function bootstrap() {
  validateEnvironmentVariables();
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(process.env.PORT!);
}
bootstrap();
