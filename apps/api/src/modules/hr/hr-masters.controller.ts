import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { HrMastersService } from './hr-masters.service';

class NameDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() headEmployeeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

class DesignationDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() departmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

class ShiftDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() startTime: string;
  @ApiProperty() @IsString() endTime: string;
  @ApiPropertyOptional() @IsOptional() @IsString() weekOff?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

class HolidayDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() startDate: string;
  @ApiProperty() @IsString() endDate: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

class LeaveTypeDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) quota?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

class AssignShiftDto {
  @ApiProperty() @IsString() employeeId: string;
  @ApiProperty() @IsString() shiftId: string;
  @ApiProperty() @IsString() date: string;
}

@ApiTags('HR Masters')
@ApiBearerAuth('access-token')
@Controller({ path: 'hr/masters', version: '1' })
export class HrMastersController {
  constructor(private readonly masters: HrMastersService) {}

  @Get('stats')
  @RequirePermissions('hr:read')
  @ApiOperation({ summary: 'HRM dashboard KPI stats' })
  stats(@CurrentUser() user: IAuthUser) {
    return this.masters.getDashboardStats(user.tenantId);
  }

  // Departments
  @Get('departments')
  @RequirePermissions('hr:read')
  listDepartments(@CurrentUser() user: IAuthUser) {
    return this.masters.listDepartments(user.tenantId);
  }

  @Post('departments')
  @RequirePermissions('hr:create')
  createDepartment(@CurrentUser() user: IAuthUser, @Body() dto: NameDto) {
    return this.masters.createDepartment(user.tenantId, dto);
  }

  @Put('departments/:id')
  @RequirePermissions('hr:update')
  updateDepartment(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: Partial<NameDto>) {
    return this.masters.updateDepartment(id, user.tenantId, dto);
  }

  @Delete('departments/:id')
  @RequirePermissions('hr:update')
  deleteDepartment(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.masters.deleteDepartment(id, user.tenantId);
  }

  // Designations
  @Get('designations')
  @RequirePermissions('hr:read')
  listDesignations(@CurrentUser() user: IAuthUser) {
    return this.masters.listDesignations(user.tenantId);
  }

  @Post('designations')
  @RequirePermissions('hr:create')
  createDesignation(@CurrentUser() user: IAuthUser, @Body() dto: DesignationDto) {
    return this.masters.createDesignation(user.tenantId, dto);
  }

  @Put('designations/:id')
  @RequirePermissions('hr:update')
  updateDesignation(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: Partial<DesignationDto>) {
    return this.masters.updateDesignation(id, user.tenantId, dto);
  }

  @Delete('designations/:id')
  @RequirePermissions('hr:update')
  deleteDesignation(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.masters.deleteDesignation(id, user.tenantId);
  }

  // Shifts
  @Get('shifts')
  @RequirePermissions('hr:read')
  listShifts(@CurrentUser() user: IAuthUser) {
    return this.masters.listShifts(user.tenantId);
  }

  @Post('shifts')
  @RequirePermissions('hr:create')
  createShift(@CurrentUser() user: IAuthUser, @Body() dto: ShiftDto) {
    return this.masters.createShift(user.tenantId, dto);
  }

  @Put('shifts/:id')
  @RequirePermissions('hr:update')
  updateShift(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: Partial<ShiftDto>) {
    return this.masters.updateShift(id, user.tenantId, dto);
  }

  @Delete('shifts/:id')
  @RequirePermissions('hr:update')
  deleteShift(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.masters.deleteShift(id, user.tenantId);
  }

  @Post('shifts/assign')
  @RequirePermissions('hr:update')
  assignShift(@CurrentUser() user: IAuthUser, @Body() dto: AssignShiftDto) {
    return this.masters.assignShift(user.tenantId, dto);
  }

  // Holidays
  @Get('holidays')
  @RequirePermissions('hr:read')
  listHolidays(@CurrentUser() user: IAuthUser, @Query('year') year?: string) {
    return this.masters.listHolidays(user.tenantId, year ? parseInt(year, 10) : undefined);
  }

  @Post('holidays')
  @RequirePermissions('hr:create')
  createHoliday(@CurrentUser() user: IAuthUser, @Body() dto: HolidayDto) {
    return this.masters.createHoliday(user.tenantId, dto);
  }

  @Put('holidays/:id')
  @RequirePermissions('hr:update')
  updateHoliday(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: Partial<HolidayDto>) {
    return this.masters.updateHoliday(id, user.tenantId, dto);
  }

  @Delete('holidays/:id')
  @RequirePermissions('hr:update')
  deleteHoliday(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.masters.deleteHoliday(id, user.tenantId);
  }

  // Leave Types
  @Get('leave-types')
  @RequirePermissions('hr:read')
  listLeaveTypes(@CurrentUser() user: IAuthUser) {
    return this.masters.listLeaveTypes(user.tenantId);
  }

  @Post('leave-types')
  @RequirePermissions('hr:create')
  createLeaveType(@CurrentUser() user: IAuthUser, @Body() dto: LeaveTypeDto) {
    return this.masters.createLeaveType(user.tenantId, dto);
  }

  @Put('leave-types/:id')
  @RequirePermissions('hr:update')
  updateLeaveType(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: Partial<LeaveTypeDto>) {
    return this.masters.updateLeaveType(id, user.tenantId, dto);
  }

  @Delete('leave-types/:id')
  @RequirePermissions('hr:update')
  deleteLeaveType(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.masters.deleteLeaveType(id, user.tenantId);
  }
}
