import {
  OneToMany,
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';
import { Registration } from './registration.entity';

// IMPORTANT: Never modify this enum while synchronize: true is enabled.
// Adding/removing values causes TypeORM to drop & recreate the column,
// destroying all existing data. Use a raw SQL migration instead:
//   ALTER TYPE "public"."event_chapter_enum" ADD VALUE 'NEW_VALUE';
export enum Chapter {
  CS = 'CS',
  RAS = 'RAS',
  PES_PELS = 'PES/PELS',
  IAS = 'IAS',
  SIGHT = 'SIGHT',
  WIE = 'WIE',
  EMBS = 'EMBS',
}

@Entity()
export class Event {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  title!: string;

  @Column({ default: '' })
  description!: string;

  @Column({ nullable: true })
  date!: Date;

  @Column({ nullable: true })
  startTime!: Date;

  @Column({ nullable: true })
  endTime!: Date;

  @Column({ default: '' })
  category!: string;

  @Column({ default: 0 })
  attendeesNeeded!: number;

  @Column({ default: 0 })
  registrations!: number;

  @Column({ default: 'Beginner' })
  level!: string;

  @Column({ type: 'enum', enum: Chapter, nullable: true })
  chapter!: Chapter;

  @Column({ default: false })
  isFeatured!: boolean;

  @Column({ default: '' })
  speakerFullName!: string;

  @Column({ default: '' })
  aboutSpeaker!: string;

  @Column({ default: '' })
  prerequisites!: string;

  @Column({ default: '' })
  speakerLinkedin!: string;

  @CreateDateColumn({ nullable: true })
  createdAt!: Date;

  @OneToMany(() => Registration, (registration) => registration.event, {
    cascade: true,
  })
  userRegistrations!: Registration[];
}
