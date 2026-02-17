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

@Injectable()
export class RegistrationService {
  constructor(
    @InjectRepository(Registration)
    private registrationRepo: Repository<Registration>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Event) private eventRepo: Repository<Event>,
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

    const registration = this.registrationRepo.create({ user, event });
    await this.registrationRepo.save(registration);

    return {
      message: 'Successfully registered',
      event: updatedEvent,
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
    }));
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

    return this.registrationRepo.remove(registration);
  }
}
