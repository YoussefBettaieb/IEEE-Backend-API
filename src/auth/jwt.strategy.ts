import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private usersService: UsersService,
    private configService: ConfigService,
  ) {
    const secret = configService.getOrThrow<string>('JWT_SECRET');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: { sub: number; email: string; isAdmin: boolean }) {
    const user = await this.usersService.findOneWithRegistrations(
      payload.email,
    );

    if (!user) {
      this.logger.warn(
        `JWT validation failed: user not found for email ${payload.email}`,
      );
      throw new UnauthorizedException('User not found');
    }

    return {
      ...user,
      isAdmin: user.isAdmin === true,
    };
  }
}
