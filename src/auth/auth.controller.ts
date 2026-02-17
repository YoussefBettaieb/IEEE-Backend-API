import { Body, Controller, Post, Get, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { User } from '../users/user.entity';
import { LoginDto } from './dtos/login.dto';
import { RegisterDto } from './dtos/register.dto';
import { UsersService } from 'src/users/users.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

// @UseGuards(JwtAuthGuard)
@ApiTags('Authentication')
@Controller('api/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @ApiOperation({ summary: 'Register a new user' }) // swagger doc
  @Post('/register')
  async register(@Body() body: RegisterDto) {
    const user = await this.authService.signup(
      body.email,
      body.password,
      body.fullName,
    );
    return user;
  }

  @ApiOperation({ summary: 'Login a user' }) // swagger doc
  @Post('/login')
  async login(@Body() body: LoginDto) {
    const user = await this.authService.signin(body.email, body.password);
    return user;
  }

  @ApiOperation({ summary: 'Validate token and get user info' }) // swagger doc
  @ApiBearerAuth('access-token')
  @Get('/validate')
  @UseGuards(JwtAuthGuard)
  async validateToken(@Req() req: any) {
    return {
      valid: true,
      user: req.user,
    };
  }

  @ApiOperation({ summary: 'Logout a user' }) // swagger doc
  @ApiBearerAuth('access-token')
  @Post('/logout')
  @UseGuards(JwtAuthGuard)
  async logout() {
    return this.authService.signout();
  }

  //@Post('/password-reset'){}
}
