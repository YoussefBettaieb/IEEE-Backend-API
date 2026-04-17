import {
  IsString,
  IsInt,
  IsBoolean,
  IsEnum,
  IsISO8601,
  Min,
} from 'class-validator';
import { Chapter } from '../event.entity';
import { ApiProperty } from '@nestjs/swagger';
import { IsAfter } from './validators/is-after.constraint';

export class CreateEventDto {
  @ApiProperty({
    example: 'Tech Talk on AI',
    description: 'Title of the event',
  })
  @IsString()
  title!: string;

  @ApiProperty({
    example: 'An in-depth discussion on AI advancements.',
    description: 'Description of the event',
  })
  @IsString()
  description!: string;

  @ApiProperty({
    example: '2024-12-01T00:00:00.000Z',
    description: 'Date of the event',
  })
  @IsISO8601()
  date!: string;

  @ApiProperty({
    example: '2024-12-01T10:00:00.000Z',
    description: 'Start time of the event',
  })
  @IsISO8601()
  startTime!: string;

  @ApiProperty({
    example: '2024-12-01T12:00:00.000Z',
    description: 'End time of the event',
  })
  @IsISO8601()
  @IsAfter('startTime', {
    message: 'endTime must be after startTime',
  })
  endTime!: string;

  @ApiProperty({
    example: 'Main Auditorium',
    description: 'Location of the event',
  })
  @IsString()
  category!: string;

  @ApiProperty({ example: 50, description: 'Number of attendees needed' })
  @IsInt()
  @Min(0)
  attendeesNeeded!: number;

  @ApiProperty({ example: 'Beginner', description: 'Level of the event' })
  @IsString()
  level!: string;

  @ApiProperty({
    example: Chapter.IAS,
    description: 'Chapter hosting the event',
  })
  @IsEnum(Chapter)
  chapter!: Chapter;

  @ApiProperty({ example: true, description: 'Is the event featured?' })
  @IsBoolean()
  isFeatured!: boolean;

  @ApiProperty({ example: 'John Doe', description: 'Full name of the speaker' })
  @IsString()
  speakerFullName!: string;

  @ApiProperty({
    example: 'Experienced AI Researcher',
    description: 'About the speaker',
  })
  @IsString()
  aboutSpeaker!: string;

  @ApiProperty({
    example: 'Basic understanding of AI concepts',
    description: 'Prerequisites for the event',
  })
  @IsString()
  prerequisites!: string;

  @ApiProperty({
    example: 'https://www.linkedin.com/in/johndoe',
    description: 'LinkedIn profile of the speaker',
  })
  @IsString()
  speakerLinkedin!: string;
}
