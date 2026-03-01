import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, scrypt as _scrypt } from 'crypto';
import { promisify } from 'util';
import { UsersService } from 'src/users/users.service';
import { JwtService } from '@nestjs/jwt';
import { User } from 'src/users/user.entity';

const scrypt = promisify(_scrypt);
@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  private generateToken(user: User) {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      isAdmin: user.isAdmin,
    });
  }

  async signup(email: string, password: string, fullName: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const users = await this.usersService.find(normalizedEmail);
    if (users.length) {
      throw new BadRequestException('Email in use');
    }
    const salt = randomBytes(8).toString('hex');
    const hash = (await scrypt(password, salt, 32)) as Buffer;
    const result = salt + '.' + hash.toString('hex');
    const user = await this.usersService.create(
      normalizedEmail,
      result,
      fullName.trim(),
    );
    const token = this.generateToken(user);

    return { user, token };
  }

  async signin(email: string, password: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const [user] = await this.usersService.find(normalizedEmail);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [salt, storedHash] = user.password.split('.');
    const hash = (await scrypt(password, salt, 32)) as Buffer;
    if (storedHash !== hash.toString('hex')) {
      throw new BadRequestException('Invalid credentials');
    }
    const token = this.generateToken(user);

    return { user, token };
  }

  async signout() {
    return { message: 'Logged out successfully' };
  }
}
