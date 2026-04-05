import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './users/users.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventsModule } from './events/events.module';

const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET', 'CORS_ORIGINS'] as const;

function validateEnv(env: Record<string, unknown>) {
  const missingVars = requiredEnvVars.filter((key) => {
    const value = env[key];
    return value === undefined || value === null || String(value).trim() === '';
  });

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}`,
    );
  }

  const jwtSecret = String(env.JWT_SECRET).trim();
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }

  const corsOrigins = String(env.CORS_ORIGINS)
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (corsOrigins.length === 0) {
    throw new Error(
      'CORS_ORIGINS must include at least one comma-separated origin',
    );
  }

  return {
    ...env,
    JWT_EXPIRES_IN: String(env.JWT_EXPIRES_IN ?? '30d'),
    CHECKIN_TOKEN_TTL: String(env.CHECKIN_TOKEN_TTL ?? '15m'),
  };
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
    AuthModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres' as const,
        url: configService.getOrThrow<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: true, // Disable in production!
      }),
      inject: [ConfigService],
    }),
    UsersModule,
    EventsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
