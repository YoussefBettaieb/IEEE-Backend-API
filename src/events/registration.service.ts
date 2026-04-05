import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { Registration } from './registration.entity';
import { User } from '../users/user.entity';
import { Event } from './event.entity';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class RegistrationService {
  constructor(
    @InjectRepository(Registration)
    private registrationRepo: Repository<Registration>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Event) private eventRepo: Repository<Event>,
    private jwtService: JwtService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async registerUserToEvent(userId: number, eventId: number) {
    // Generate check-in token
    const checkinToken = this.jwtService.sign({
      type: 'event-checkin',
      userId: userId,
      eventId: eventId,
    });

    try {
      await this.dataSource.transaction(async (manager) => {
        const user = await manager.findOne(User, { where: { id: userId } });
        if (!user) {
          throw new NotFoundException('User not found');
        }

        const event = await manager.findOne(Event, { where: { id: eventId } });
        if (!event) {
          throw new NotFoundException('Event not found');
        }

        const incrementResult = await manager
          .createQueryBuilder()
          .update(Event)
          .set({ registrations: () => '"registrations" + 1' })
          .where('id = :eventId', { eventId })
          .andWhere('"registrations" < "attendeesNeeded"')
          .execute();

        if ((incrementResult.affected ?? 0) === 0) {
          throw new BadRequestException('Event has reached maximum capacity');
        }

        const registration = manager.create(Registration, {
          user,
          event,
          checkinToken,
          isCheckedIn: false,
        });

        await manager.save(Registration, registration);
      });
    } catch (e) {
      if (e instanceof BadRequestException || e instanceof NotFoundException) {
        throw e;
      }

      if (e instanceof QueryFailedError) {
        const driverError = e.driverError as { code?: string } | undefined;
        if (driverError?.code === '23505') {
          throw new BadRequestException(
            'User already registered for this event',
          );
        }
      }

      throw e;
    }

    const updatedEvent = await this.eventRepo.findOne({
      where: { id: eventId },
    });
    if (!updatedEvent) {
      throw new NotFoundException('Event not found');
    }

    return {
      message: 'Successfully registered',
      event: updatedEvent,
      checkinToken,
    };
  }

  /* async getUserRegistrations(userId: number) {
    return this.registrationRepo.find({
      where: { user: { id: userId } },
      relations: ['event'],
    });
  } */

  async getEventAttendees(eventId: number) {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    return event.registrations;
  }

  async getRegisteredUsers(eventId: number) {
    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');

    const registrations = await this.registrationRepo.find({
      where: { event: { id: eventId } },
      relations: ['user'],
    });

    return registrations.map((registration) => ({
      id: registration.user.id,
      email: registration.user.email,
      fullName: registration.user.fullName,
      registeredAt: registration.registeredAt,
      isCheckedIn: registration.isCheckedIn,
      checkedInAt: registration.checkedInAt,
    }));
  }

  async getUserRegistrations(userId: number) {
    const registrations = await this.registrationRepo.find({
      where: { user: { id: userId } },
      relations: ['event'],
    });

    return registrations.map((registration) => ({
      id: registration.event.id,
      eventId: registration.event.id,
      title: registration.event.title,
      registeredAt: registration.registeredAt,
      checkinToken: registration.checkinToken,
      isCheckedIn: registration.isCheckedIn,
    }));
  }

  async getRegistrationToken(userId: number, eventId: number) {
    const registration = await this.registrationRepo.findOne({
      where: { user: { id: userId }, event: { id: eventId } },
      relations: ['user', 'event'],
    });
    if (!registration) throw new NotFoundException('Registration not found');

    // If token doesn't exist (legacy registrations), generate one
    if (!registration.checkinToken) {
      registration.checkinToken = this.jwtService.sign({
        type: 'event-checkin',
        userId: userId,
        eventId: eventId,
      });
      await this.registrationRepo.save(registration);
    }

    return {
      checkinToken: registration.checkinToken,
      isCheckedIn: registration.isCheckedIn,
    };
  }

  async verifyCheckin(token: string) {
    try {
      const payload = this.jwtService.verify(token);

      if (payload.type !== 'event-checkin') {
        throw new BadRequestException('Invalid token type');
      }

      const registration = await this.registrationRepo.findOne({
        where: {
          user: { id: payload.userId },
          event: { id: payload.eventId },
        },
        relations: ['user', 'event'],
      });

      if (!registration) {
        throw new NotFoundException('Registration not found');
      }

      if (registration.isCheckedIn) {
        return {
          message: 'Already checked in',
          alreadyCheckedIn: true,
          user: {
            id: registration.user.id,
            fullName: registration.user.fullName,
            email: registration.user.email,
          },
          event: {
            id: registration.event.id,
            title: registration.event.title,
          },
          checkedInAt: registration.checkedInAt,
        };
      }

      // Mark as checked in
      registration.isCheckedIn = true;
      registration.checkedInAt = new Date();
      await this.registrationRepo.save(registration);

      return {
        message: 'Check-in successful',
        alreadyCheckedIn: false,
        user: {
          id: registration.user.id,
          fullName: registration.user.fullName,
          email: registration.user.email,
        },
        event: {
          id: registration.event.id,
          title: registration.event.title,
        },
        checkedInAt: registration.checkedInAt,
      };
    } catch (e) {
      if (e instanceof BadRequestException || e instanceof NotFoundException) {
        throw e;
      }
      throw new BadRequestException('Invalid or expired check-in token');
    }
  }

  async unregister(userId: number, eventId: number) {
    await this.dataSource.transaction(async (manager) => {
      const registration = await manager.findOne(Registration, {
        where: { user: { id: userId }, event: { id: eventId } },
      });

      if (!registration) {
        throw new NotFoundException('Registration not found');
      }

      await manager.delete(Registration, { id: registration.id });

      await manager
        .createQueryBuilder()
        .update(Event)
        .set({
          registrations: () =>
            'CASE WHEN "registrations" > 0 THEN "registrations" - 1 ELSE 0 END',
        })
        .where('id = :eventId', { eventId })
        .execute();
    });

    return {
      message: 'User unregistered successfully',
      userId,
      eventId,
    };
  }
}
