import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from './event.entity';
import { Registration } from './registration.entity';
import { CreateEventDto } from './dtos/create-event.dto';
import { UpdateEventDto } from './dtos/update-event.dto';
import { Favorite } from './favorite.entity';
import { User } from 'src/users/user.entity';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event) private repo: Repository<Event>,
    @InjectRepository(Registration)
    private registrationRepo: Repository<Registration>,
    @InjectRepository(Favorite)
    private favoriteRepo: Repository<Favorite>,
    @InjectRepository(User)
    private usersRepo: Repository<User>,
  ) {}

  private async getFavoriteEventIdSet(userId: number): Promise<Set<number>> {
    const favorites = await this.favoriteRepo.find({
      where: { user: { id: userId } },
      relations: ['event'],
    });
    return new Set(favorites.map((favorite) => favorite.event.id));
  }

  private decorateEventWithUserState(
    event: Event,
    favoriteEventIds: Set<number>,
  ): Event & { isFavorite: boolean } {
    return {
      ...event,
      isFavorite: favoriteEventIds.has(event.id),
    };
  }

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

  private parseDateOrNull(value: unknown): Date | null {
    if (value == null) {
      return null;
    }

    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed;
  }

  private ensureValidEventWindow(startTime: unknown, endTime: unknown): void {
    const parsedStart = this.parseDateOrNull(startTime);
    const parsedEnd = this.parseDateOrNull(endTime);

    if (!parsedStart || !parsedEnd) {
      throw new BadRequestException(
        'Event startTime and endTime must be valid ISO-8601 values.',
      );
    }

    if (parsedEnd.getTime() <= parsedStart.getTime()) {
      throw new BadRequestException('Event endTime must be after startTime.');
    }
  }

  async findAll(userId: number) {
    const events = await this.repo.find({ order: { date: 'ASC' } });
    const eventIds = events.map((event) => event.id);
    const [countMap, favoriteEventIds] = await Promise.all([
      this.getRegistrationCountMap(eventIds),
      this.getFavoriteEventIdSet(userId),
    ]);

    for (const event of events) {
      event.registrations = countMap.get(event.id) ?? 0;
    }

    return events.map((event) =>
      this.decorateEventWithUserState(event, favoriteEventIds),
    );
  }

  async findOne(id: number, userId: number) {
    const event = await this.repo.findOne({ where: { id } });
    if (!event) {
      throw new NotFoundException(`Event with ID ${id} not found`);
    }

    const [countMap, favoriteEventIds] = await Promise.all([
      this.getRegistrationCountMap([id]),
      this.getFavoriteEventIdSet(userId),
    ]);
    event.registrations = countMap.get(id) ?? 0;

    return this.decorateEventWithUserState(event, favoriteEventIds);
  }

  async create(createEventDto: CreateEventDto) {
    this.ensureValidEventWindow(
      createEventDto.startTime,
      createEventDto.endTime,
    );

    const event = this.repo.create({
      ...createEventDto,
      registrations: 0, // Always start with 0 registrations
    });
    return this.repo.save(event);
  }

  async update(id: number, attrs: UpdateEventDto) {
    const event = await this.repo.findOne({ where: { id } });
    if (!event) {
      throw new NotFoundException(`Event with ID ${id} not found`);
    }

    const effectiveStartTime = attrs.startTime ?? event.startTime;
    const effectiveEndTime = attrs.endTime ?? event.endTime;
    this.ensureValidEventWindow(effectiveStartTime, effectiveEndTime);

    Object.assign(event, attrs);
    return this.repo.save(event);
  }

  async remove(id: number) {
    const event = await this.repo.findOne({ where: { id } });
    if (!event) {
      throw new NotFoundException(`Event with ID ${id} not found`);
    }

    // Delete all registrations for this event first
    await this.registrationRepo.delete({ event: { id } });

    // Then delete the event
    return this.repo.remove(event);
  }

  async getUserFavorites(userId: number) {
    const favorites = await this.favoriteRepo.find({
      where: { user: { id: userId } },
      relations: ['event'],
      order: { createdAt: 'DESC' },
    });

    const uniqueEventIds = Array.from(
      new Set(favorites.map((favorite) => favorite.event.id)),
    );
    const countMap = await this.getRegistrationCountMap(uniqueEventIds);

    return favorites.map((favorite) => {
      const event = favorite.event;
      event.registrations = countMap.get(event.id) ?? 0;
      return {
        ...event,
        isFavorite: true,
      };
    });
  }

  async addFavorite(userId: number, eventId: number) {
    const [user, event] = await Promise.all([
      this.usersRepo.findOne({ where: { id: userId } }),
      this.repo.findOne({ where: { id: eventId } }),
    ]);

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (!event) {
      throw new NotFoundException(`Event with ID ${eventId} not found`);
    }

    const existing = await this.favoriteRepo.findOne({
      where: {
        user: { id: userId },
        event: { id: eventId },
      },
    });

    if (existing) {
      throw new ConflictException('Event is already in favorites');
    }

    await this.favoriteRepo.save(
      this.favoriteRepo.create({
        user,
        event,
      }),
    );

    return {
      success: true,
      isFavorite: true,
      eventId,
    };
  }

  async removeFavorite(userId: number, eventId: number) {
    const favorite = await this.favoriteRepo.findOne({
      where: {
        user: { id: userId },
        event: { id: eventId },
      },
    });

    if (!favorite) {
      return {
        success: true,
        isFavorite: false,
        eventId,
      };
    }

    await this.favoriteRepo.remove(favorite);

    return {
      success: true,
      isFavorite: false,
      eventId,
    };
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
