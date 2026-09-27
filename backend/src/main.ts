import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api/agency-api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({ origin: true, credentials: true });
  // 内容工厂素材/封面上传文件静态服务（dist/../uploads）
  const uploadRoot = process.env.UPLOAD_ROOT ?? join(__dirname, '..', 'uploads');
  app.useStaticAssets(uploadRoot, { prefix: '/uploads/' });
  await app.listen(Number(process.env.PORT ?? 3000));
}
bootstrap();
