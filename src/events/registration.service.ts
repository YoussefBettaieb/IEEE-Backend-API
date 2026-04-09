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
import { ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';

type CheckinTokenPayload = {
  type: 'event-checkin';
  registrationId?: number;
  userId: number;
  eventId: number;
};

const REGISTRATION_BLOCKED_DEMO_EMAILS = new Set(['ieee@example.com']);

@Injectable()
export class RegistrationService {
  constructor(
    @InjectRepository(Registration)
    private registrationRepo: Repository<Registration>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Event) private eventRepo: Repository<Event>,
    private jwtService: JwtService,
    private configService: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  private createCheckinToken(payload: {
    registrationId: number;
    userId: number;
    eventId: number;
  }): string {
    const expiresIn =
      this.configService.getOrThrow<StringValue>('CHECKIN_TOKEN_TTL');

    return this.jwtService.sign(
      {
        type: 'event-checkin',
        registrationId: payload.registrationId,
        userId: payload.userId,
        eventId: payload.eventId,
      },
      { expiresIn },
    );
  }

  private async getEventRegistrationCount(
    manager: DataSource['manager'],
    eventId: number,
  ): Promise<number> {
    return manager.count(Registration, {
      where: { event: { id: eventId } },
    });
  }

  async registerUserToEvent(userId: number, eventId: number) {
    let checkinToken = '';

    try {
      await this.dataSource.transaction(async (manager) => {
        const user = await manager.findOne(User, { where: { id: userId } });
        if (!user) {
          throw new NotFoundException('User not found');
        }

        const normalizedEmail = user.email.trim().toLowerCase();
        if (REGISTRATION_BLOCKED_DEMO_EMAILS.has(normalizedEmail)) {
          throw new BadRequestException(
            'Demo account cannot register for events. Please create your own account.',
          );
        }

        const event = await manager
          .createQueryBuilder(Event, 'event')
          .setLock('pessimistic_write')
          .where('event.id = :eventId', { eventId })
          .getOne();
        if (!event) {
          throw new NotFoundException('Event not found');
        }

        const currentRegistrationCount = await this.getEventRegistrationCount(
          manager,
          eventId,
        );
        if (currentRegistrationCount >= event.attendeesNeeded) {
          throw new BadRequestException('Event has reached maximum capacity');
        }

        const registration = manager.create(Registration, {
          user,
          event,
          isCheckedIn: false,
        });

        const savedRegistration = await manager.save(
          Registration,
          registration,
        );
        checkinToken = this.createCheckinToken({
          registrationId: savedRegistration.id,
          userId,
          eventId,
        });

        savedRegistration.checkinToken = checkinToken;
        await manager.save(Registration, savedRegistration);

        await manager.update(
          Event,
          { id: eventId },
          { registrations: currentRegistrationCount + 1 },
        );
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

    if (!checkinToken) {
      throw new BadRequestException('Failed to issue check-in token');
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

    const actualCount = await this.registrationRepo.count({
      where: { event: { id: eventId } },
    });
    return actualCount;
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

    // If token doesn't exist or is legacy without registrationId, generate one.
    const decoded = registration.checkinToken
      ? this.jwtService.decode(registration.checkinToken)
      : null;
    const decodedPayload =
      decoded && typeof decoded === 'object'
        ? (decoded as Partial<CheckinTokenPayload>)
        : null;

    if (
      !registration.checkinToken ||
      typeof decodedPayload?.registrationId !== 'number'
    ) {
      registration.checkinToken = this.createCheckinToken({
        registrationId: registration.id,
        userId,
        eventId,
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
      const payload = this.jwtService.verify<CheckinTokenPayload>(token);

      if (payload.type !== 'event-checkin') {
        throw new BadRequestException('Invalid token type');
      }

      const registration =
        typeof payload.registrationId === 'number'
          ? await this.registrationRepo.findOne({
              where: { id: payload.registrationId },
              relations: ['user', 'event'],
            })
          : await this.registrationRepo.findOne({
              where: {
                user: { id: payload.userId },
                event: { id: payload.eventId },
              },
              relations: ['user', 'event'],
            });

      if (!registration) {
        throw new NotFoundException('Registration not found');
      }

      if (
        registration.user.id !== payload.userId ||
        registration.event.id !== payload.eventId
      ) {
        throw new BadRequestException('Token does not match registration');
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

      const remainingRegistrationCount = await this.getEventRegistrationCount(
        manager,
        eventId,
      );
      await manager.update(
        Event,
        { id: eventId },
        { registrations: remainingRegistrationCount },
      );
    });

    return {
      message: 'User unregistered successfully',
      userId,
      eventId,
    };
  }
}
