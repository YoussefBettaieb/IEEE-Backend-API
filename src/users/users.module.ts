import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { Registration } from '../events/registration.entity';
import { Event } from '../events/event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Registration, Event])],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
