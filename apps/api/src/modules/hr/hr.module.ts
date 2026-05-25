import { Module } from '@nestjs/common';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, NotFoundException } from '@nestjs/common';
import { IsString, IsOptional, IsNumber, IsEnum, IsDateString, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender, AttendanceStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { paginate, getPaginationArgs } from '@/shared/pagination.helper';
import { PaginationDto } from '@/common/dto/pagination.dto';
import * as dayjs from 'dayjs';

export class CreateEmployeeDto {
  @ApiProperty() @IsString() firstName: string;
  @ApiProperty() @IsString() lastName: string;
  @ApiProperty() @IsString() phone: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiProperty() @IsDateString() joiningDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() designation?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() branchId?: string;
  @ApiProperty() @IsNumber() @Min(0) basicSalary: number;
  @ApiPropertyOptional({ enum: Gender }) @IsOptional() @IsEnum(Gender) gender?: Gender;
}

export class MarkAttendanceDto {
  @ApiProperty() @IsString() employeeId: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty({ enum: AttendanceStatus }) @IsEnum(AttendanceStatus) status: AttendanceStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() checkIn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() checkOut?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreatePayrollDto {
  @ApiProperty() @IsString() employeeId: string;
  @ApiProperty() @IsInt() month: number;
  @ApiProperty() @IsInt() year: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) allowances?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) bonus?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) deductions?: number;
}

export class CreateLeaveRequestDto {
  @ApiProperty() @IsString() employeeId: string;
  @ApiProperty() @IsDateString() startDate: string;
  @ApiProperty() @IsDateString() endDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() leaveType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

@Injectable()
export class HrService {
  constructor(private readonly prisma: PrismaService) {}

  async createEmployee(tenantId: string, dto: CreateEmployeeDto) {
    const code = `EMP-${Date.now().toString(36).toUpperCase()}`;
    return this.prisma.employee.create({
      data: {
        tenantId, code,
        firstName: dto.firstName, lastName: dto.lastName,
        phone: dto.phone, email: dto.email,
        joiningDate: new Date(dto.joiningDate),
        designation: dto.designation,
        department: dto.department,
        branchId: dto.branchId,
        basicSalary: dto.basicSalary,
        gender: dto.gender,
      },
      include: { branch: true },
    });
  }

  async findAll(tenantId: string, query: PaginationDto) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const where = {
      tenantId,
      ...(query.search && {
        OR: [
          { firstName: { contains: query.search, mode: 'insensitive' as const } },
          { lastName: { contains: query.search, mode: 'insensitive' as const } },
          { code: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where, skip, take,
        include: { branch: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.employee.count({ where }),
    ]);
    return paginate(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async findOne(id: string, tenantId: string) {
    const emp = await this.prisma.employee.findFirst({
      where: { id, tenantId },
      include: {
        branch: true,
        attendances: { orderBy: { date: 'desc' }, take: 30 },
        payrolls: { orderBy: { year: 'desc' }, take: 12 },
      },
    });
    if (!emp) throw new NotFoundException('Employee not found');
    return emp;
  }

  async markAttendance(tenantId: string, dto: MarkAttendanceDto) {
    return this.prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: dto.employeeId, date: new Date(dto.date) } },
      update: {
        status: dto.status,
        checkIn: dto.checkIn ? new Date(dto.checkIn) : undefined,
        checkOut: dto.checkOut ? new Date(dto.checkOut) : undefined,
        notes: dto.notes,
      },
      create: {
        tenantId,
        employeeId: dto.employeeId,
        date: new Date(dto.date),
        status: dto.status,
        checkIn: dto.checkIn ? new Date(dto.checkIn) : undefined,
        checkOut: dto.checkOut ? new Date(dto.checkOut) : undefined,
        notes: dto.notes,
      },
    });
  }

  async getAttendance(tenantId: string, employeeId: string, month: string) {
    const start = dayjs(month).startOf('month').toDate();
    const end = dayjs(month).endOf('month').toDate();
    return this.prisma.attendance.findMany({
      where: { tenantId, employeeId, date: { gte: start, lte: end } },
      orderBy: { date: 'asc' },
    });
  }

  async updateEmployee(id: string, tenantId: string, dto: Partial<CreateEmployeeDto>) {
    await this.findOne(id, tenantId);
    return this.prisma.employee.update({
      where: { id },
      data: {
        ...dto,
        joiningDate: dto.joiningDate ? new Date(dto.joiningDate) : undefined,
      },
      include: { branch: true },
    });
  }

  async deactivateEmployee(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.employee.update({ where: { id }, data: { isActive: false } });
  }

  async getAttendanceBulk(tenantId: string, date: string) {
    const employees = await this.prisma.employee.findMany({
      where: { tenantId, isActive: true },
      include: { branch: true },
      orderBy: { firstName: 'asc' },
    });
    const attendances = await this.prisma.attendance.findMany({
      where: { tenantId, date: new Date(date) },
    });
    const map = new Map(attendances.map((a) => [a.employeeId, a]));
    return employees.map((emp) => ({ ...emp, todayAttendance: map.get(emp.id) ?? null }));
  }

  async markAttendanceBulk(tenantId: string, date: string, rows: { employeeId: string; status: AttendanceStatus; checkIn?: string; checkOut?: string }[]) {
    return this.prisma.$transaction(
      rows.map((r) =>
        this.prisma.attendance.upsert({
          where: { employeeId_date: { employeeId: r.employeeId, date: new Date(date) } },
          update: { status: r.status, checkIn: r.checkIn ? new Date(r.checkIn) : null, checkOut: r.checkOut ? new Date(r.checkOut) : null },
          create: { tenantId, employeeId: r.employeeId, date: new Date(date), status: r.status, checkIn: r.checkIn ? new Date(r.checkIn) : null, checkOut: r.checkOut ? new Date(r.checkOut) : null },
        })
      )
    );
  }

  async getPayrolls(tenantId: string, month: number, year: number) {
    return this.prisma.payroll.findMany({
      where: { tenantId, month, year },
      include: { employee: true },
      orderBy: { employee: { firstName: 'asc' } },
    });
  }

  async markPayrollPaid(id: string, tenantId: string) {
    const p = await this.prisma.payroll.findFirst({ where: { id, tenantId } });
    if (!p) throw new NotFoundException('Payroll not found');
    return this.prisma.payroll.update({ where: { id }, data: { isPaid: true, paidAt: new Date() } });
  }

  async generatePayroll(tenantId: string, dto: CreatePayrollDto) {
    const employee = await this.findOne(dto.employeeId, tenantId);
    const gross = employee.basicSalary + (dto.allowances ?? 0) + (dto.bonus ?? 0);
    const netSalary = gross - (dto.deductions ?? 0);

    return this.prisma.payroll.upsert({
      where: { employeeId_month_year: { employeeId: dto.employeeId, month: dto.month, year: dto.year } },
      update: { basicSalary: employee.basicSalary, allowances: dto.allowances ?? 0, bonus: dto.bonus ?? 0, deductions: dto.deductions ?? 0, netSalary },
      create: { tenantId, employeeId: dto.employeeId, month: dto.month, year: dto.year, basicSalary: employee.basicSalary, allowances: dto.allowances ?? 0, bonus: dto.bonus ?? 0, deductions: dto.deductions ?? 0, netSalary },
    });
  }

  async generatePayrollBulk(tenantId: string, month: number, year: number, opts: { allowances?: number; bonus?: number; deductAbsent?: boolean; absentDeduction?: number }) {
    const employees = await this.prisma.employee.findMany({ where: { tenantId, isActive: true } });
    const results: any[] = [];
    for (const emp of employees) {
      let deductions = 0;
      if (opts.deductAbsent) {
        const start = dayjs(`${year}-${String(month).padStart(2,'0')}-01`).startOf('month').toDate();
        const end   = dayjs(`${year}-${String(month).padStart(2,'0')}-01`).endOf('month').toDate();
        const absentDays = await this.prisma.attendance.count({
          where: { tenantId, employeeId: emp.id, date: { gte: start, lte: end }, status: 'ABSENT' as any },
        });
        deductions = absentDays * (opts.absentDeduction ?? 0);
      }
      const gross = emp.basicSalary + (opts.allowances ?? 0) + (opts.bonus ?? 0);
      const netSalary = Math.max(0, gross - deductions);
      const p = await this.prisma.payroll.upsert({
        where: { employeeId_month_year: { employeeId: emp.id, month, year } },
        update: { basicSalary: emp.basicSalary, allowances: opts.allowances ?? 0, bonus: opts.bonus ?? 0, deductions, netSalary },
        create: { tenantId, employeeId: emp.id, month, year, basicSalary: emp.basicSalary, allowances: opts.allowances ?? 0, bonus: opts.bonus ?? 0, deductions, netSalary },
      });
      results.push(p);
    }
    return results;
  }

  async getAttendanceSummary(tenantId: string, month: string) {
    const start = dayjs(month).startOf('month').toDate();
    const end   = dayjs(month).endOf('month').toDate();
    const employees = await this.prisma.employee.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, firstName: true, lastName: true, code: true, designation: true, department: true, basicSalary: true },
      orderBy: { firstName: 'asc' },
    });
    const attendances = await this.prisma.attendance.findMany({
      where: { tenantId, date: { gte: start, lte: end } },
    });
    const map = new Map<string, Record<string, number>>();
    attendances.forEach((a) => {
      if (!map.has(a.employeeId)) map.set(a.employeeId, { PRESENT: 0, ABSENT: 0, HALF_DAY: 0, ON_LEAVE: 0, LATE: 0, LEAVE: 0, HOLIDAY: 0 });
      const entry = map.get(a.employeeId)!;
      const s = a.status as string;
      entry[s] = (entry[s] ?? 0) + 1;
    });
    return employees.map((e) => ({ ...e, summary: map.get(e.id) ?? { PRESENT: 0, ABSENT: 0, HALF_DAY: 0, ON_LEAVE: 0, LATE: 0, LEAVE: 0, HOLIDAY: 0 } }));
  }

  async createLeaveRequest(tenantId: string, dto: CreateLeaveRequestDto) {
    await this.findOne(dto.employeeId, tenantId);
    return this.prisma.leaveRequest.create({
      data: { tenantId, employeeId: dto.employeeId, startDate: new Date(dto.startDate), endDate: new Date(dto.endDate), leaveType: dto.leaveType ?? 'CASUAL', reason: dto.reason, notes: dto.notes },
      include: { employee: { select: { firstName: true, lastName: true, code: true, department: true } } },
    });
  }

  async getLeaveRequests(tenantId: string, query: { status?: string; month?: number; year?: number }) {
    const where: any = { tenantId };
    if (query.status) where.status = query.status;
    if (query.month && query.year) {
      where.startDate = { gte: new Date(query.year, query.month - 1, 1), lt: new Date(query.year, query.month, 1) };
    }
    return this.prisma.leaveRequest.findMany({
      where,
      include: { employee: { select: { firstName: true, lastName: true, code: true, department: true, designation: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateLeaveStatus(id: string, tenantId: string, status: string, userId: string) {
    const leave = await this.prisma.leaveRequest.findFirst({ where: { id, tenantId } });
    if (!leave) throw new NotFoundException('Leave request not found');
    return this.prisma.leaveRequest.update({
      where: { id },
      data: { status, ...(status === 'APPROVED' && { approvedBy: userId }) },
      include: { employee: { select: { firstName: true, lastName: true, code: true } } },
    });
  }
}

@ApiTags('HR')
@ApiBearerAuth('access-token')
@Controller({ path: 'hr/employees', version: '1' })
export class HrController {
  constructor(private readonly hrService: HrService) {}

  @Post()
  @RequirePermissions('hr:create')
  create(@CurrentUser() user: IAuthUser, @Body() dto: CreateEmployeeDto) {
    return this.hrService.createEmployee(user.tenantId, dto);
  }

  @Get()
  @RequirePermissions('hr:read')
  findAll(@CurrentUser() user: IAuthUser, @Query() query: PaginationDto) {
    return this.hrService.findAll(user.tenantId, query);
  }

  // ── Static routes MUST come before :id routes ──────────────────────────

  @Get('attendance/daily')
  @RequirePermissions('hr:read')
  @ApiOperation({ summary: 'Get all employees with attendance for a date' })
  getAttendanceBulk(@CurrentUser() user: IAuthUser, @Query('date') date: string) {
    return this.hrService.getAttendanceBulk(user.tenantId, date ?? dayjs().format('YYYY-MM-DD'));
  }

  @Get('attendance/monthly-summary')
  @RequirePermissions('hr:read')
  @ApiOperation({ summary: 'Monthly attendance summary per employee' })
  getAttendanceSummary(@CurrentUser() user: IAuthUser, @Query('month') month: string) {
    return this.hrService.getAttendanceSummary(user.tenantId, month ?? dayjs().format('YYYY-MM'));
  }

  @Post('payroll/bulk')
  @RequirePermissions('hr:create')
  @ApiOperation({ summary: 'Generate payroll for all active employees' })
  generatePayrollBulk(@CurrentUser() user: IAuthUser, @Body() body: { month: number; year: number; allowances?: number; bonus?: number; deductAbsent?: boolean; absentDeduction?: number }) {
    return this.hrService.generatePayrollBulk(user.tenantId, body.month, body.year, body);
  }

  @Post('leaves')
  @RequirePermissions('hr:create')
  @ApiOperation({ summary: 'Create a leave request' })
  createLeave(@CurrentUser() user: IAuthUser, @Body() dto: CreateLeaveRequestDto) {
    return this.hrService.createLeaveRequest(user.tenantId, dto);
  }

  @Get('leaves')
  @RequirePermissions('hr:read')
  @ApiOperation({ summary: 'Get leave requests' })
  getLeaves(@CurrentUser() user: IAuthUser, @Query('status') status: string, @Query('month') month: string, @Query('year') year: string) {
    return this.hrService.getLeaveRequests(user.tenantId, { status, month: month ? parseInt(month) : undefined, year: year ? parseInt(year) : undefined });
  }

  @Put('leaves/:id/status')
  @RequirePermissions('hr:update')
  @ApiOperation({ summary: 'Approve or reject a leave request' })
  updateLeaveStatus(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body('status') status: string) {
    return this.hrService.updateLeaveStatus(id, user.tenantId, status, user.id);
  }

  @Post('attendance/bulk')
  @RequirePermissions('hr:update')
  @ApiOperation({ summary: 'Bulk mark attendance for a date' })
  markAttendanceBulk(@CurrentUser() user: IAuthUser, @Body() body: { date: string; rows: { employeeId: string; status: AttendanceStatus }[] }) {
    return this.hrService.markAttendanceBulk(user.tenantId, body.date, body.rows);
  }

  @Post('attendance')
  @RequirePermissions('hr:update')
  @ApiOperation({ summary: 'Mark/update employee attendance' })
  markAttendance(@CurrentUser() user: IAuthUser, @Body() dto: MarkAttendanceDto) {
    return this.hrService.markAttendance(user.tenantId, dto);
  }

  @Get('payroll')
  @RequirePermissions('hr:read')
  @ApiOperation({ summary: 'Get payrolls for a month/year' })
  getPayrolls(@CurrentUser() user: IAuthUser, @Query('month') month: string, @Query('year') year: string) {
    return this.hrService.getPayrolls(user.tenantId, parseInt(month ?? String(dayjs().month() + 1)), parseInt(year ?? String(dayjs().year())));
  }

  @Post('payroll')
  @RequirePermissions('hr:create')
  @ApiOperation({ summary: 'Generate payroll for an employee' })
  generatePayroll(@CurrentUser() user: IAuthUser, @Body() dto: CreatePayrollDto) {
    return this.hrService.generatePayroll(user.tenantId, dto);
  }

  @Put('payroll/:id/paid')
  @RequirePermissions('hr:update')
  markPaid(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.hrService.markPayrollPaid(id, user.tenantId);
  }

  // ── Dynamic :id routes MUST come last ──────────────────────────────────

  @Get(':id')
  @RequirePermissions('hr:read')
  findOne(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.hrService.findOne(id, user.tenantId);
  }

  @Put(':id')
  @RequirePermissions('hr:update')
  update(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: Partial<CreateEmployeeDto>) {
    return this.hrService.updateEmployee(id, user.tenantId, dto);
  }

  @Delete(':id')
  @RequirePermissions('hr:update')
  @ApiOperation({ summary: 'Deactivate employee' })
  deactivate(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.hrService.deactivateEmployee(id, user.tenantId);
  }

  @Get(':id/attendance')
  @RequirePermissions('hr:read')
  getAttendance(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Query('month') month: string) {
    return this.hrService.getAttendance(user.tenantId, id, month ?? dayjs().format('YYYY-MM'));
  }
}

@Module({
  controllers: [HrController],
  providers: [HrService],
  exports: [HrService],
})
export class HrModule {}
