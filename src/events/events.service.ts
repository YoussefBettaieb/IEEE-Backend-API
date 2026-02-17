import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from './event.entity';
import { Registration } from './registration.entity';
import { CreateEventDto } from './dtos/create-event.dto';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event) private repo: Repository<Event>,
    @InjectRepository(Registration)
    private registrationRepo: Repository<Registration>,
  ) {}

  async findAll() {
    return this.repo.find();
  }

  async findOne(id: number) {
    return this.repo.findOne({ where: { id } });
  }

  async create(createEventDto: CreateEventDto) {
    const event = this.repo.create(createEventDto);
    return this.repo.save(event);
  }

  async update(id: number, attrs: Partial<CreateEventDto>) {
    const event = await this.findOne(id);
    if (!event) {
      throw new Error('Event not found');
    }
    Object.assign(event, attrs);
    return this.repo.save(event);
  }

  async remove(id: number) {
    const event = await this.findOne(id);
    if (!event) {
      throw new Error('Event not found');
    }

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
