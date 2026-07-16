import { Module } from '@nestjs/common';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CalendarTaskStatus } from '@prisma/client';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { CalendarService } from './calendar.service';

export class CreateNoteDto {
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() body?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() color?: string;
}

export class CreateTaskDto {
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() priority?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() assigneeId?: string;
}

export class UpdateTaskStatusDto {
  @ApiProperty({ enum: CalendarTaskStatus }) @IsEnum(CalendarTaskStatus) status: CalendarTaskStatus;
}

export class CreateMeetingDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsDateString() startsAt: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) attendees?: string[];
}

@ApiTags('Calendar')
@ApiBearerAuth('access-token')
@Controller({ path: 'calendar', version: '1' })
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get('month')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Month overview badges for business calendar' })
  getMonth(
    @CurrentUser() user: IAuthUser,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const now = new Date();
    const y = year ? parseInt(year, 10) : now.getFullYear();
    const m = month ? parseInt(month, 10) : now.getMonth() + 1;
    return this.calendar.getMonthOverview(user.tenantId, y, m);
  }

  @Get('day')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Day detail: sales, profit, expenses, dues, notes/tasks/meetings' })
  getDay(@CurrentUser() user: IAuthUser, @Query('date') date: string) {
    const key = date || new Date().toISOString().slice(0, 10);
    return this.calendar.getDayDetail(user.tenantId, key);
  }

  @Post('notes')
  @RequirePermissions('accounting:create')
  createNote(@CurrentUser() user: IAuthUser, @Body() dto: CreateNoteDto) {
    return this.calendar.createNote(user.tenantId, user.id, { ...dto, branchId: user.branchId });
  }

  @Delete('notes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('accounting:delete')
  deleteNote(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.calendar.deleteNote(id, user.tenantId);
  }

  @Post('tasks')
  @RequirePermissions('accounting:create')
  createTask(@CurrentUser() user: IAuthUser, @Body() dto: CreateTaskDto) {
    return this.calendar.createTask(user.tenantId, user.id, { ...dto, branchId: user.branchId });
  }

  @Put('tasks/:id/status')
  @RequirePermissions('accounting:update')
  updateTaskStatus(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: UpdateTaskStatusDto) {
    return this.calendar.updateTaskStatus(id, user.tenantId, dto.status);
  }

  @Delete('tasks/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('accounting:delete')
  deleteTask(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.calendar.deleteTask(id, user.tenantId);
  }

  @Post('meetings')
  @RequirePermissions('accounting:create')
  createMeeting(@CurrentUser() user: IAuthUser, @Body() dto: CreateMeetingDto) {
    return this.calendar.createMeeting(user.tenantId, user.id, { ...dto, branchId: user.branchId });
  }

  @Delete('meetings/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('accounting:delete')
  deleteMeeting(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.calendar.deleteMeeting(id, user.tenantId);
  }
}

@Module({
  controllers: [CalendarController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
