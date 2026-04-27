import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from './event.entity';
import { Registration } from './registration.entity';
import { Favorite } from './favorite.entity';
import { RegistrationService } from './registration.service';
import { User } from 'src/users/user.entity';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';

@Module({
  imports: [
    TypeOrmModule.forFeature([Event, Registration, User, Favorite]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const secret = configService.getOrThrow<string>('JWT_SECRET');
        const expiresIn =
          configService.getOrThrow<StringValue>('JWT_EXPIRES_IN');
        return {
          secret,
          signOptions: { expiresIn },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [EventsController],
  providers: [EventsService, RegistrationService],
})
export class EventsModule {}
