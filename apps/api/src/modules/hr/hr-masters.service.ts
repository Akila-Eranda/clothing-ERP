import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

const DEFAULT_LEAVE_TYPES = [
  { name: 'Casual', quota: 14 },
  { name: 'Sick', quota: 7 },
  { name: 'Annual', quota: 21 },
  { name: 'Maternity', quota: 84 },
  { name: 'Paternity', quota: 3 },
];

@Injectable()
export class HrMastersService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Departments ──────────────────────────────────────────────────────────

  async listDepartments(tenantId: string) {
    const rows = await this.prisma.hrDepartment.findMany({
      where: { tenantId },
      include: { designations: { where: { isActive: true }, select: { id: true } } },
      orderBy: { name: 'asc' },
    });
    const employeeCounts = await this.prisma.employee.groupBy({
      by: ['department'],
      where: { tenantId, isActive: true, department: { not: null } },
      _count: { id: true },
    });
    const countMap = new Map(employeeCounts.map((e) => [e.department ?? '', e._count.id]));
    return rows.map((d) => ({
      ...d,
      memberCount: countMap.get(d.name) ?? 0,
      designationCount: d.designations.length,
    }));
  }

  async createDepartment(tenantId: string, data: { name: string; description?: string; headEmployeeId?: string; isActive?: boolean }) {
    return this.prisma.hrDepartment.create({
      data: { tenantId, name: data.name.trim(), description: data.description, headEmployeeId: data.headEmployeeId, isActive: data.isActive ?? true },
    });
  }

  async updateDepartment(id: string, tenantId: string, data: Partial<{ name: string; description?: string; headEmployeeId?: string; isActive?: boolean }>) {
    await this.ensureDepartment(id, tenantId);
    return this.prisma.hrDepartment.update({
      where: { id },
      data: { ...data, ...(data.name ? { name: data.name.trim() } : {}) },
    });
  }

  async deleteDepartment(id: string, tenantId: string) {
    await this.ensureDepartment(id, tenantId);
    return this.prisma.hrDepartment.update({ where: { id }, data: { isActive: false } });
  }

  private async ensureDepartment(id: string, tenantId: string) {
    const row = await this.prisma.hrDepartment.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Department not found');
    return row;
  }

  // ── Designations ─────────────────────────────────────────────────────────

  async listDesignations(tenantId: string) {
    const rows = await this.prisma.hrDesignation.findMany({
      where: { tenantId },
      include: { department: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
    const employeeCounts = await this.prisma.employee.groupBy({
      by: ['designation'],
      where: { tenantId, isActive: true, designation: { not: null } },
      _count: { id: true },
    });
    const countMap = new Map(employeeCounts.map((e) => [e.designation ?? '', e._count.id]));
    return rows.map((d) => ({ ...d, memberCount: countMap.get(d.name) ?? 0 }));
  }

  async createDesignation(tenantId: string, data: { name: string; departmentId?: string; isActive?: boolean }) {
    return this.prisma.hrDesignation.create({
      data: { tenantId, name: data.name.trim(), departmentId: data.departmentId, isActive: data.isActive ?? true },
      include: { department: { select: { id: true, name: true } } },
    });
  }

  async updateDesignation(id: string, tenantId: string, data: Partial<{ name: string; departmentId?: string; isActive?: boolean }>) {
    await this.ensureDesignation(id, tenantId);
    return this.prisma.hrDesignation.update({
      where: { id },
      data: { ...data, ...(data.name ? { name: data.name.trim() } : {}) },
      include: { department: { select: { id: true, name: true } } },
    });
  }

  async deleteDesignation(id: string, tenantId: string) {
    await this.ensureDesignation(id, tenantId);
    return this.prisma.hrDesignation.update({ where: { id }, data: { isActive: false } });
  }

  private async ensureDesignation(id: string, tenantId: string) {
    const row = await this.prisma.hrDesignation.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Designation not found');
    return row;
  }

  // ── Shifts ───────────────────────────────────────────────────────────────

  async listShifts(tenantId: string) {
    const rows = await this.prisma.shift.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
    const counts = await this.prisma.employeeShift.groupBy({
      by: ['shiftId'],
      where: { shift: { tenantId }, isActive: true },
      _count: { id: true },
    });
    const countMap = new Map(counts.map((c) => [c.shiftId, c._count.id]));
    return rows.map((s) => ({ ...s, memberCount: countMap.get(s.id) ?? 0 }));
  }

  async createShift(tenantId: string, data: { name: string; startTime: string; endTime: string; weekOff?: string; description?: string; isActive?: boolean }) {
    return this.prisma.shift.create({
      data: { tenantId, name: data.name.trim(), startTime: data.startTime, endTime: data.endTime, weekOff: data.weekOff, description: data.description, isActive: data.isActive ?? true },
    });
  }

  async updateShift(id: string, tenantId: string, data: Partial<{ name: string; startTime: string; endTime: string; weekOff?: string; description?: string; isActive?: boolean }>) {
    await this.ensureShift(id, tenantId);
    return this.prisma.shift.update({
      where: { id },
      data: { ...data, ...(data.name ? { name: data.name.trim() } : {}) },
    });
  }

  async deleteShift(id: string, tenantId: string) {
    await this.ensureShift(id, tenantId);
    return this.prisma.shift.update({ where: { id }, data: { isActive: false } });
  }

  async assignShift(tenantId: string, data: { employeeId: string; shiftId: string; date: string }) {
    const emp = await this.prisma.employee.findFirst({ where: { id: data.employeeId, tenantId } });
    if (!emp) throw new NotFoundException('Employee not found');
    await this.ensureShift(data.shiftId, tenantId);
    return this.prisma.employeeShift.create({
      data: { employeeId: data.employeeId, shiftId: data.shiftId, date: new Date(data.date) },
      include: { shift: true, employee: { select: { firstName: true, lastName: true, code: true } } },
    });
  }

  private async ensureShift(id: string, tenantId: string) {
    const row = await this.prisma.shift.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Shift not found');
    return row;
  }

  // ── Holidays ─────────────────────────────────────────────────────────────

  async listHolidays(tenantId: string, year?: number) {
    const where: { tenantId: string; startDate?: { gte: Date; lte: Date } } = { tenantId };
    if (year) {
      where.startDate = { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31T23:59:59`) };
    }
    return this.prisma.hrHoliday.findMany({ where, orderBy: { startDate: 'asc' } });
  }

  async createHoliday(tenantId: string, data: { name: string; startDate: string; endDate: string; isActive?: boolean }) {
    return this.prisma.hrHoliday.create({
      data: { tenantId, name: data.name.trim(), startDate: new Date(data.startDate), endDate: new Date(data.endDate), isActive: data.isActive ?? true },
    });
  }

  async updateHoliday(id: string, tenantId: string, data: Partial<{ name: string; startDate: string; endDate: string; isActive?: boolean }>) {
    await this.ensureHoliday(id, tenantId);
    return this.prisma.hrHoliday.update({
      where: { id },
      data: {
        ...data,
        ...(data.name ? { name: data.name.trim() } : {}),
        ...(data.startDate ? { startDate: new Date(data.startDate) } : {}),
        ...(data.endDate ? { endDate: new Date(data.endDate) } : {}),
      },
    });
  }

  async deleteHoliday(id: string, tenantId: string) {
    await this.ensureHoliday(id, tenantId);
    return this.prisma.hrHoliday.update({ where: { id }, data: { isActive: false } });
  }

  private async ensureHoliday(id: string, tenantId: string) {
    const row = await this.prisma.hrHoliday.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Holiday not found');
    return row;
  }

  // ── Leave Types ──────────────────────────────────────────────────────────

  async listLeaveTypes(tenantId: string) {
    let rows = await this.prisma.hrLeaveType.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
    if (rows.length === 0) {
      await this.prisma.hrLeaveType.createMany({
        data: DEFAULT_LEAVE_TYPES.map((t) => ({ tenantId, name: t.name, quota: t.quota })),
      });
      rows = await this.prisma.hrLeaveType.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
    }
    return rows;
  }

  async createLeaveType(tenantId: string, data: { name: string; quota?: number; isActive?: boolean }) {
    return this.prisma.hrLeaveType.create({
      data: { tenantId, name: data.name.trim(), quota: data.quota ?? 14, isActive: data.isActive ?? true },
    });
  }

  async updateLeaveType(id: string, tenantId: string, data: Partial<{ name: string; quota?: number; isActive?: boolean }>) {
    await this.ensureLeaveType(id, tenantId);
    return this.prisma.hrLeaveType.update({
      where: { id },
      data: { ...data, ...(data.name ? { name: data.name.trim() } : {}) },
    });
  }

  async deleteLeaveType(id: string, tenantId: string) {
    await this.ensureLeaveType(id, tenantId);
    return this.prisma.hrLeaveType.update({ where: { id }, data: { isActive: false } });
  }

  private async ensureLeaveType(id: string, tenantId: string) {
    const row = await this.prisma.hrLeaveType.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Leave type not found');
    return row;
  }

  // ── Dashboard stats ──────────────────────────────────────────────────────

  async getDashboardStats(tenantId: string) {
    const [total, active, inactive, newJoiners, pendingLeaves, todayPresent] = await Promise.all([
      this.prisma.employee.count({ where: { tenantId } }),
      this.prisma.employee.count({ where: { tenantId, isActive: true } }),
      this.prisma.employee.count({ where: { tenantId, isActive: false } }),
      this.prisma.employee.count({
        where: {
          tenantId,
          isActive: true,
          joiningDate: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
      }),
      this.prisma.leaveRequest.count({ where: { tenantId, status: 'PENDING' } }),
      this.prisma.attendance.count({
        where: {
          tenantId,
          date: new Date(new Date().toISOString().slice(0, 10)),
          status: { in: ['PRESENT', 'LATE'] },
        },
      }),
    ]);
    return { total, active, inactive, newJoiners, pendingLeaves, todayPresent };
  }
}
