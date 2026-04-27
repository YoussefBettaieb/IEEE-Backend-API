import { Exclude } from 'class-transformer';
import {
  OneToMany,
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Registration } from '../events/registration.entity';
import { Favorite } from '../events/favorite.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ unique: true })
  email: string;

  @Column()
  @Exclude()
  password: string;

  @Column()
  fullName: string;

  @Column({ default: false })
  isAdmin: boolean;

  @CreateDateColumn({ nullable: true })
  createdAt: Date;

  @OneToMany(() => Registration, (registration) => registration.user, {
    cascade: true,
  })
  registrations: Registration[];

  @OneToMany(() => Favorite, (favorite) => favorite.user)
  favorites: Favorite[];
}
