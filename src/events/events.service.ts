import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from './event.entity';
import { Registration } from './registration.entity';
import { CreateEventDto } from './dtos/create-event.dto';
import { UpdateEventDto } from './dtos/update-event.dto';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event) private repo: Repository<Event>,
    @InjectRepository(Registration)
    private registrationRepo: Repository<Registration>,
  ) {}

  private async getRegistrationCountMap(
    eventIds: number[],
  ): Promise<Map<number, number>> {
    const counts = new Map<number, number>();
    if (eventIds.length === 0) {
      return counts;
    }

    const rawCounts = await this.registrationRepo
      .createQueryBuilder('registration')
      .leftJoin('registration.event', 'event')
      .select('event.id', 'eventId')
      .addSelect('COUNT(registration.id)', 'count')
      .where('event.id IN (:...eventIds)', { eventIds })
      .groupBy('event.id')
      .getRawMany<{ eventId: string; count: string }>();

    for (const row of rawCounts) {
      counts.set(Number(row.eventId), Number(row.count));
    }

    return counts;
  }

  async findAll() {
    const events = await this.repo.find({ order: { date: 'ASC' } });
    const countMap = await this.getRegistrationCountMap(
      events.map((event) => event.id),
    );

    for (const event of events) {
      event.registrations = countMap.get(event.id) ?? 0;
    }

    return events;
  }

  async findOne(id: number) {
    const event = await this.repo.findOne({ where: { id } });
    if (!event) {
      throw new NotFoundException(`Event with ID ${id} not found`);
    }

    const countMap = await this.getRegistrationCountMap([id]);
    event.registrations = countMap.get(id) ?? 0;

    return event;
  }

  async create(createEventDto: CreateEventDto) {
    const event = this.repo.create({
      ...createEventDto,
      registrations: 0, // Always start with 0 registrations
    });
    return this.repo.save(event);
  }

  async update(id: number, attrs: UpdateEventDto) {
    const event = await this.findOne(id);
    Object.assign(event, attrs);
    return this.repo.save(event);
  }

  async remove(id: number) {
    const event = await this.findOne(id);

    // Delete all registrations for this event first
    await this.registrationRepo.delete({ event: { id } });

    // Then delete the event
    return this.repo.remove(event);
  }

  /* async findFiltered(query: {
    category?: string;
    chapter?: string;
    sort?: string;
  }) {
    const qb = this.repo.createQueryBuilder('event');

    if (query.category) {
      qb.andWhere('event.category = :category', { category: query.category });
    }

    if (query.chapter) {
      qb.andWhere('event.chapter = :chapter', { chapter: query.chapter });
    }

    if (query.sort === 'date') {
      qb.orderBy('event.date', 'ASC');
    }

    const events = await qb.getMany();
    return { events };
  } */
}
