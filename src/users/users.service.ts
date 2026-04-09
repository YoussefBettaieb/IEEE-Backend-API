import { Injectable, NotFoundException } from '@nestjs/common';
import { User } from './user.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Registration } from '../events/registration.entity';
import { Event } from '../events/event.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private repo: Repository<User>,
    @InjectRepository(Registration)
    private registrationRepo: Repository<Registration>,
    @InjectRepository(Event)
    private eventRepo: Repository<Event>,
  ) {}

  private async syncEventRegistrationCounts(eventIds: number[]) {
    if (eventIds.length === 0) {
      return;
    }

    const rawCounts = await this.registrationRepo
      .createQueryBuilder('registration')
      .leftJoin('registration.event', 'event')
      .select('event.id', 'eventId')
      .addSelect('COUNT(registration.id)', 'count')
      .where('event.id IN (:...eventIds)', { eventIds })
      .groupBy('event.id')
      .getRawMany<{ eventId: string; count: string }>();

    const countMap = new Map<number, number>();
    for (const row of rawCounts) {
      countMap.set(Number(row.eventId), Number(row.count));
    }

    for (const eventId of eventIds) {
      await this.eventRepo.update(
        { id: eventId },
        { registrations: countMap.get(eventId) ?? 0 },
      );
    }
  }

  create(email: string, password: string, fullName: string) {
    const user = this.repo.create({ email, password, fullName });
    return this.repo.save(user);
  }

  findOne(email: string) {
    if (!email) {
      return null;
    }
    return this.repo.findOne({ where: { email } });
  }

  findOneWithRegistrations(email: string) {
    if (!email) {
      return null;
    }
    return this.repo.findOne({
      where: { email },
      relations: ['registrations'],
    });
  }

  findOneById(id: number) {
    if (!id) {
      return null;
    }
    return this.repo.findOne({ where: { id } });
  }

  find(email: string) {
    return this.repo.find({ where: { email } });
  }

  async findAll() {
    return this.repo.find();
  }

  async update(email: string, attrs: Partial<User>) {
    const user = await this.findOne(email);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    Object.assign(user, attrs);
    return this.repo.save(user);
  }

  async updateById(id: number, attrs: Partial<User>) {
    const user = await this.findOneById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    Object.assign(user, attrs);
    return this.repo.save(user);
  }

  async remove(email: string) {
    const user = await this.findOne(email);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.repo.remove(user);
  }

  async removeById(id: number) {
    const user = await this.findOneById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingRegistrations = await this.registrationRepo.find({
      where: { user: { id } },
      relations: ['event'],
    });
    const affectedEventIds = Array.from(
      new Set(
        existingRegistrations
          .map((registration) => registration.event?.id)
          .filter((eventId): eventId is number => typeof eventId === 'number'),
      ),
    );

    // Delete all registrations for this user first
    await this.registrationRepo.delete({ user: { id } });

    // Keep denormalized event counters in sync with actual registration rows.
    await this.syncEventRegistrationCounts(affectedEventIds);

    // Then delete the user
    return this.repo.remove(user);
  }
}
