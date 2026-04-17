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

type CheckinWindowEvaluation = {
  isWithinWindow: boolean;
  status:
    | 'on_time'
    | 'too_early'
    | 'too_late'
    | 'window_unavailable'
    | 'invalid_window';
  message: string;
};

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

  private evaluateCheckinWindow(
    event: Event,
    now: Date,
  ): CheckinWindowEvaluation {
    const startTime = event.startTime ? new Date(event.startTime) : null;
    const endTime = event.endTime ? new Date(event.endTime) : null;

    if (
      !startTime ||
      !endTime ||
      Number.isNaN(startTime.getTime()) ||
      Number.isNaN(endTime.getTime())
    ) {
      return {
        isWithinWindow: false,
        status: 'window_unavailable',
        message:
          'Check-in rejected: this event has no valid start/end time configured.',
      };
    }

    if (endTime < startTime) {
      return {
        isWithinWindow: false,
        status: 'invalid_window',
        message:
          'Check-in rejected: event time configuration is invalid (endTime is before startTime).',
      };
    }

    if (now < startTime) {
      return {
        isWithinWindow: false,
        status: 'too_early',
        message: 'Check-in is not open yet for this event.',
      };
    }

    if (now > endTime) {
      return {
        isWithinWindow: false,
        status: 'too_late',
        message: 'Check-in is closed because the event time has ended.',
      };
    }

    return {
      isWithinWindow: true,
      status: 'on_time',
      message: 'Check-in is within the event time window.',
    };
  }

  private buildDetailedCheckinWindowMessage(
    windowEvaluation: CheckinWindowEvaluation,
    event: Event,
    now: Date,
  ): string {
    const startTime = event.startTime ? new Date(event.startTime) : null;
    const endTime = event.endTime ? new Date(event.endTime) : null;

    const toIso = (value: Date | null) =>
      value && !Number.isNaN(value.getTime()) ? value.toISOString() : 'unknown';

    if (windowEvaluation.status === 'too_early') {
      return `Check-in rejected: too early. Opens at ${toIso(startTime)}. Current server time: ${now.toISOString()}.`;
    }

    if (windowEvaluation.status === 'too_late') {
      return `Check-in rejected: too late. Closed at ${toIso(endTime)}. Current server time: ${now.toISOString()}.`;
    }

    if (windowEvaluation.status === 'window_unavailable') {
      return `Check-in rejected: event check-in window is not configured. Event window: ${toIso(startTime)} - ${toIso(endTime)}. Current server time: ${now.toISOString()}.`;
    }

    if (windowEvaluation.status === 'invalid_window') {
      return `Check-in rejected: event time window is invalid (end before start). Event window: ${toIso(startTime)} - ${toIso(endTime)}. Current server time: ${now.toISOString()}.`;
    }

    return `${windowEvaluation.message} Event window: ${toIso(startTime)} - ${toIso(endTime)}. Current server time: ${now.toISOString()}.`;
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
      checkedOutAt: registration.checkedOutAt,
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
      checkedInAt: registration.checkedInAt,
      checkedOutAt: registration.checkedOutAt,
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
        ? (decoded as Partial<CheckinTokenPayload> & { exp?: number })
        : null;

    const nowEpochSeconds = Math.floor(Date.now() / 1000);
    const isExpired =
      typeof decodedPayload?.exp !== 'number' ||
      decodedPayload.exp <= nowEpochSeconds;
    const isPayloadMismatch =
      decodedPayload?.userId !== userId ||
      decodedPayload?.eventId !== eventId ||
      decodedPayload?.registrationId !== registration.id;

    if (
      !registration.checkinToken ||
      typeof decodedPayload?.registrationId !== 'number' ||
      isExpired ||
      isPayloadMismatch
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
      checkedInAt: registration.checkedInAt,
      checkedOutAt: registration.checkedOutAt,
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

      const now = new Date();
      const windowEvaluation = this.evaluateCheckinWindow(
        registration.event,
        now,
      );

      if (registration.checkedOutAt) {
        return {
          message: 'Already checked out',
          alreadyCheckedOut: true,
          user: {
            id: registration.user.id,
            fullName: registration.user.fullName,
            email: registration.user.email,
          },
          event: {
            id: registration.event.id,
            title: registration.event.title,
            startTime: registration.event.startTime,
            endTime: registration.event.endTime,
          },
          serverTime: now,
          checkinWindow: windowEvaluation,
          checkedInAt: registration.checkedInAt,
          checkedOutAt: registration.checkedOutAt,
        };
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
            startTime: registration.event.startTime,
            endTime: registration.event.endTime,
          },
          serverTime: now,
          checkinWindow: windowEvaluation,
          checkedInAt: registration.checkedInAt,
          checkedOutAt: registration.checkedOutAt,
        };
      }

      if (!windowEvaluation.isWithinWindow) {
        throw new BadRequestException(
          this.buildDetailedCheckinWindowMessage(
            windowEvaluation,
            registration.event,
            now,
          ),
        );
      }

      // Mark as checked in
      registration.isCheckedIn = true;
      registration.checkedInAt = registration.checkedInAt ?? new Date();
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
          startTime: registration.event.startTime,
          endTime: registration.event.endTime,
        },
        serverTime: now,
        checkinWindow: windowEvaluation,
        checkedInAt: registration.checkedInAt,
        checkedOutAt: registration.checkedOutAt,
      };
    } catch (e) {
      if (e instanceof BadRequestException || e instanceof NotFoundException) {
        throw e;
      }

      const jwtError = e as {
        name?: string;
        message?: string;
        expiredAt?: Date;
      };

      if (jwtError?.name === 'TokenExpiredError') {
        const expiredAt =
          jwtError.expiredAt instanceof Date
            ? jwtError.expiredAt.toISOString()
            : 'unknown';
        throw new BadRequestException(
          `Check-in token expired at ${expiredAt}. Please open the ticket again to refresh the QR code.`,
        );
      }

      if (jwtError?.name === 'JsonWebTokenError') {
        throw new BadRequestException(
          `Invalid check-in token (${jwtError.message ?? 'signature/payload error'}). Please refresh the attendee QR code.`,
        );
      }

      if (jwtError?.name === 'NotBeforeError') {
        throw new BadRequestException(
          `Check-in token is not active yet (${jwtError.message ?? 'nbf claim'}).`,
        );
      }

      throw new BadRequestException('Invalid or expired check-in token');
    }
  }

  async verifyCheckout(token: string) {
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

      const now = new Date();
      const windowEvaluation = this.evaluateCheckinWindow(
        registration.event,
        now,
      );

      if (!registration.isCheckedIn) {
        if (registration.checkedOutAt) {
          return {
            message: 'Already checked out',
            alreadyCheckedOut: true,
            user: {
              id: registration.user.id,
              fullName: registration.user.fullName,
              email: registration.user.email,
            },
            event: {
              id: registration.event.id,
              title: registration.event.title,
              startTime: registration.event.startTime,
              endTime: registration.event.endTime,
            },
            serverTime: now,
            checkinWindow: windowEvaluation,
            checkedInAt: registration.checkedInAt,
            checkedOutAt: registration.checkedOutAt,
          };
        }

        throw new BadRequestException('Cannot check out before checking in');
      }

      if (!windowEvaluation.isWithinWindow) {
        throw new BadRequestException(
          this.buildDetailedCheckinWindowMessage(
            windowEvaluation,
            registration.event,
            now,
          ),
        );
      }

      registration.isCheckedIn = false;
      registration.checkedOutAt = new Date();
      await this.registrationRepo.save(registration);

      return {
        message: 'Check-out successful',
        alreadyCheckedOut: false,
        user: {
          id: registration.user.id,
          fullName: registration.user.fullName,
          email: registration.user.email,
        },
        event: {
          id: registration.event.id,
          title: registration.event.title,
          startTime: registration.event.startTime,
          endTime: registration.event.endTime,
        },
        serverTime: now,
        checkinWindow: windowEvaluation,
        checkedInAt: registration.checkedInAt,
        checkedOutAt: registration.checkedOutAt,
      };
    } catch (e) {
      if (e instanceof BadRequestException || e instanceof NotFoundException) {
        throw e;
      }

      const jwtError = e as {
        name?: string;
        message?: string;
        expiredAt?: Date;
      };

      if (jwtError?.name === 'TokenExpiredError') {
        const expiredAt =
          jwtError.expiredAt instanceof Date
            ? jwtError.expiredAt.toISOString()
            : 'unknown';
        throw new BadRequestException(
          `Check-out token expired at ${expiredAt}. Please open the ticket again to refresh the QR code.`,
        );
      }

      if (jwtError?.name === 'JsonWebTokenError') {
        throw new BadRequestException(
          `Invalid check-out token (${jwtError.message ?? 'signature/payload error'}). Please refresh the attendee QR code.`,
        );
      }

      if (jwtError?.name === 'NotBeforeError') {
        throw new BadRequestException(
          `Check-out token is not active yet (${jwtError.message ?? 'nbf claim'}).`,
        );
      }

      throw new BadRequestException('Invalid or expired check-out token');
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
