import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  Unique,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Event } from './event.entity';

@Entity()
@Unique('UQ_user_event_favorite', ['user', 'event'])
export class Favorite {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, (user) => user.favorites, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @ManyToOne(() => Event, (event) => event.favorites, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'eventId' })
  event!: Event;

  @CreateDateColumn()
  createdAt!: Date;
}
