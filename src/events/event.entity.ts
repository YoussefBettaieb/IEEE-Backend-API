import {
  OneToMany,
  AfterInsert,
  AfterRemove,
  AfterUpdate,
  Entity,
  Column,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Registration } from '../events/registration.entity';
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
  id: number;

  @Column()
  title: string;

  @Column()
  description: string;

  @Column()
  date: Date;

  @Column()
  startTime: Date;

  @Column()
  endTime: Date;

  @Column()
  category: string;

  @Column()
  attendeesNeeded: number;

  @Column()
  registrations: number;

  @Column()
  level: string;

  @Column()
  chapter: Chapter;

  @Column()
  isFeatured: boolean;

  @Column()
  speakerFullName: string;

  @Column()
  aboutSpeaker: string;

  @Column()
  prerequisites: string;

  @Column()
  speakerLinkedin: string;

  @OneToMany(() => Registration, (registration) => registration.event, {
    cascade: true,
  })
  userRegistrations: Registration[];

  @AfterInsert() // hooks executed after saving
  logInsert() {
    console.log('inserted event with id:', this.id);
  }

  @AfterUpdate() // hooks executed after updating
  logUpdate() {
    console.log('updated event with id:', this.id);
  }

  @AfterRemove() // hooks executed after removing
  logRemove() {
    console.log('removed event with id:', this.id);
  }
}
