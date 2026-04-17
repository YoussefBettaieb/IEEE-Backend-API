import {
  Get,
  Post,
  Delete,
  Put,
  Body,
  Param,
  Controller,
  UseGuards,
  Request,
} from '@nestjs/common';
import { CreateEventDto } from './dtos/create-event.dto';
import { UpdateEventDto } from './dtos/update-event.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { AdminGuard } from 'src/guards/admin.guard';
import { RegistrationService } from './registration.service';
import { EventsService } from './events.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Events')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('/api/events')
export class EventsController {
  constructor(
    private eventsService: EventsService,
    private registrationService: RegistrationService,
  ) {}

  @ApiOperation({ summary: 'Get all events' }) // swagger doc
  @Get()
  async getAllEvents() {
    return this.eventsService.findAll();
  }

  @ApiOperation({ summary: 'Get current user registrations' })
  @Get('me/registrations')
  async getUserRegistrations(@Request() req: any) {
    return this.registrationService.getUserRegistrations(req.user.id);
  }

  /* @Get()
  async getEvents(
    @Query('category') category?: string,
    @Query('chapter') chapter?: string,
    @Query('sort') sort?: string,
  ) {
    return this.eventsService.findFiltered({ category, chapter, sort });
  } */

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Create a new event (Admin only)' }) // swagger doc
  @Post()
  async createEvent(@Body() body: CreateEventDto) {
    return this.eventsService.create(body);
  }

  @ApiOperation({ summary: 'Get event by ID' }) // swagger doc
  @Get(':id')
  async getEventById(@Param('id') id: number) {
    return this.eventsService.findOne(id);
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update an event (Admin only)' }) // swagger doc
  @Put(':id')
  async updateEvent(@Param('id') id: number, @Body() body: UpdateEventDto) {
    return this.eventsService.update(id, body);
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Delete an event (Admin only)' }) // swagger doc
  @Delete(':id')
  async deleteEvent(@Param('id') id: number) {
    return this.eventsService.remove(id);
  }

  @ApiOperation({ summary: 'Register current user to an event' }) // swagger doc
  @Post(':id/register')
  async registerToEvent(@Request() req: any, @Param('id') id: number) {
    return this.registrationService.registerUserToEvent(req.user.id, id);
  }

  @ApiOperation({ summary: 'Unregister current user from an event' }) // swagger doc
  @Delete(':id/register')
  async unregisterFromEvent(@Request() req: any, @Param('id') id: number) {
    return this.registrationService.unregister(req.user.id, id);
  }

  @ApiOperation({ summary: 'Get registrations for an event' }) // swagger doc
  @Get(':id/registrations')
  async getEventRegistrations(@Param('id') id: number) {
    return this.registrationService.getEventAttendees(id);
  }

  @ApiOperation({ summary: 'Get users registered for an event (Admin only)' }) // swagger doc
  @UseGuards(AdminGuard)
  @Get(':id/registered-users')
  async getRegisteredUsers(@Param('id') id: number) {
    return this.registrationService.getRegisteredUsers(id);
  }

  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Remove a user registration from event (Admin only)',
  }) // swagger doc
  @Delete(':eventId/registration/:userId')
  async removeUserRegistration(
    @Param('eventId') eventId: number,
    @Param('userId') userId: number,
  ) {
    return this.registrationService.unregister(userId, eventId);
  }

  @ApiOperation({ summary: 'Get check-in token for a registration' })
  @Get(':id/checkin-token')
  async getCheckinToken(@Request() req: any, @Param('id') id: number) {
    return this.registrationService.getRegistrationToken(req.user.id, id);
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Verify QR code and check in user (Admin only)' })
  @Post('check-in')
  async verifyCheckin(@Body() body: { token: string }) {
    return this.registrationService.verifyCheckin(body.token);
  }

  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Verify QR code and check out user (Admin only)' })
  @Post('check-out')
  async verifyCheckout(@Body() body: { token: string }) {
    return this.registrationService.verifyCheckout(body.token);
  }
}
