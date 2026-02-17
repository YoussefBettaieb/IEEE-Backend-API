import { Injectable, NotFoundException } from '@nestjs/common';
import { User } from './user.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Registration } from '../events/registration.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private repo: Repository<User>,
    @InjectRepository(Registration)
    private registrationRepo: Repository<Registration>,
  ) {}

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

    // Delete all registrations for this user first
    await this.registrationRepo.delete({ user: { id } });

    // Then delete the user
    return this.repo.remove(user);
  }
}
