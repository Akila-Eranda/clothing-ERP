import { IsString, IsOptional, IsEnum, IsArray, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationChannel, NotificationType } from '@prisma/client';

export class CreateNotificationDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() message: string;
  @ApiPropertyOptional({ enum: NotificationType })
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;
  @ApiPropertyOptional({ enum: NotificationChannel })
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;
  @ApiPropertyOptional() @IsOptional() @IsString() link?: string;
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) recipientIds: string[];
  @ApiPropertyOptional() @IsOptional() data?: Record<string, unknown>;
}

export class QueueSmsDto {
  @ApiProperty() @IsString() @Matches(/^\+?[0-9 ()-]{7,20}$/, { message: 'phone must be a valid phone number' }) phone: string;
  @ApiProperty() @IsString() @MaxLength(1000) message: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) type?: string;
}
