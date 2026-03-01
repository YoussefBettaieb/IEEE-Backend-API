import {
  Controller,
  Get,
  UseGuards,
  Request,
  Put,
  Body,
  Delete,
  Param,
  ForbiddenException,
} from '@nestjs/common';
import { User } from './user.entity';
import { UsersService } from './users.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { AdminGuard } from 'src/guards/admin.guard';
import { UpdateUserDto } from './dtos/update-user.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

// Swagger conf
@ApiTags('Users')
@ApiBearerAuth('access-token')
// controller conf
@UseGuards(JwtAuthGuard)
@Controller('api/users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all users (Admin only)' }) // swagger doc
  @UseGuards(AdminGuard)
  async AllUsers() {
    return this.usersService.findAll();
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' }) // swagger doc
  async getCurrentUser(@Request() req: any) {
    return req.user;
  }

  @Put('me')
  @ApiOperation({ summary: 'Update current user profile' }) // swagger doc
  async updateCurrentUser(@Request() req: any, @Body() body: UpdateUserDto) {
    const user: User = req.user;
    return this.usersService.update(user.email, body);
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get user by ID (Admin only)' }) // swagger doc
  @Get(':id')
  async getUserById(@Param('id') id: number) {
    return this.usersService.findOneById(id);
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update user role (Admin only)' }) // swagger doc
  @Put(':id/role')
  async updateUserRole(
    @Request() req: any,
    @Param('id') id: number,
    @Body() body: { isAdmin: boolean },
  ) {
    const targetId = Number(id);
    if (req.user?.id === targetId && body.isAdmin === false) {
      throw new ForbiddenException('You cannot remove your own admin role');
    }
    if (req.user?.id === targetId && body.isAdmin === true) {
      throw new ForbiddenException('You cannot promote yourself');
    }
    return this.usersService.updateById(id, { isAdmin: body.isAdmin } as any);
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Delete a user (Admin only)' }) // swagger doc
  @Delete(':id')
  async deleteUser(@Param('id') id: number) {
    await this.usersService.removeById(id);
    return { message: 'User deleted successfully' };
  }
}
