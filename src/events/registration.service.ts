import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  ) {}

  async registerUserToEvent(userId: number, eventId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    const event = await this.eventRepo.findOne({ where: { id: eventId } });

    if (!user) throw new NotFoundException('User not found');
    if (!event) throw new NotFoundException('Event not found');

    // Check if already registered
    const existing = await this.registrationRepo.findOne({
      where: { user: { id: userId }, event: { id: eventId } },
    });
    if (existing) {
      throw new BadRequestException('User already registered for this event');
    }

    // Check if event has reached maximum capacity
    if (event.registrations >= event.attendeesNeeded) {
      throw new BadRequestException('Event has reached maximum capacity');
    }

    event.registrations += 1;
    const updatedEvent = await this.eventRepo.save(event);

    // Generate check-in token
    const checkinToken = this.jwtService.sign({
      type: 'event-checkin',
      userId: userId,
      eventId: eventId,
    });

    const registration = this.registrationRepo.create({
      user,
      event,
      checkinToken,
      isCheckedIn: false,
    });
    await this.registrationRepo.save(registration);

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
    const registration = await this.registrationRepo.findOne({
      where: { user: { id: userId }, event: { id: eventId } },
    });
    if (!registration) throw new NotFoundException('Registration not found');

    const event = await this.eventRepo.findOne({ where: { id: eventId } });
    if (event) {
      event.registrations -= 1;
      await this.eventRepo.save(event);
    }

    await this.registrationRepo.remove(registration);
    return {
      message: 'User unregistered successfully',
      userId,
      eventId,
    };
  }
}
