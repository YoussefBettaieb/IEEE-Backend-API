import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  Column,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Event } from './event.entity';

@Entity()
export class Registration {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.registrations)
  user: User;

  @ManyToOne(() => Event, (event) => event.userRegistrations)
  event: Event;

  @CreateDateColumn()
  registeredAt: Date;

  @Column({ nullable: true })
  checkinToken: string;

  @Column({ default: false })
  isCheckedIn: boolean;

  @Column({ type: 'timestamp', nullable: true })
  checkedInAt: Date;
}
