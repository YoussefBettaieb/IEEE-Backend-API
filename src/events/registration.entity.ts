import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  Column,
  Index,
  Unique,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Event } from './event.entity';

@Entity()
@Unique(['user', 'event']) // Prevent duplicate registrations at DB level
export class Registration {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @ManyToOne(() => User, (user) => user.registrations, { onDelete: 'CASCADE' })
  user: User;

  @Index()
  @ManyToOne(() => Event, (event) => event.userRegistrations, {
    onDelete: 'CASCADE',
  })
  event: Event;

  @CreateDateColumn()
  registeredAt: Date;

  @Column({ nullable: true })
  checkinToken: string;

  @Column({ default: false })
  isCheckedIn: boolean;

  @Column({ type: 'timestamp', nullable: true })
  checkedInAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  checkedOutAt: Date;
}
