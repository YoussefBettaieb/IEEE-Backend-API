import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ClassSerializerInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

function isLocalDevOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
      (url.protocol === 'http:' || url.protocol === 'https:')
    );
  } catch {
    return false;
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
  const configService = app.get(ConfigService);

  // Enable global validation pipe so DTO decorators from class-validator are enforced
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  const allowedOrigins = configService
    .getOrThrow<string>('CORS_ORIGINS')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  const nodeEnv = configService.get<string>('NODE_ENV') ?? 'development';
  const allowLocalDevWildcard = nodeEnv !== 'production';

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Native mobile clients often send no Origin header.
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      // Flutter web often starts on random localhost ports in development.
      if (allowLocalDevWildcard && isLocalDevOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Not allowed by CORS: ${origin}`), false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('Mobile IEEE Backend API')
    .setDescription('API documentation for the Mobile IEEE INSAT SB App')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 5000;
  await app.listen(port, '0.0.0.0');
  logger.log(`Application running on port ${port}`);
  logger.log(
    `CORS allowlist enabled for ${allowedOrigins.length} origin(s), NODE_ENV=${nodeEnv}`,
  );
}

bootstrap();
