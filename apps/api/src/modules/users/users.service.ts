import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AuthService } from '@/modules/auth/auth.service';
import { KeycloakAdminService } from '@/modules/auth/keycloak-admin.service';
import { CreateUserDto, UpdateUserDto } from './dto/create-user.dto';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { paginate, getPaginationArgs } from '@/shared/pagination.helper';
import { UserStatus } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly kcAdmin: KeycloakAdminService,
  ) {}

  async create(tenantId: string, dto: CreateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase(), tenantId },
    });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await this.authService.hashPassword(dto.password);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (tenant) {
      const userCount = await this.prisma.user.count({ where: { tenantId } });
      if (userCount >= tenant.maxUsers) {
        throw new ForbiddenException(`User limit reached (${tenant.maxUsers}). Upgrade your plan.`);
      }
    }

    const user = await this.prisma.user.create({
      data: {
        tenantId,
        email: dto.email.toLowerCase(),
        firstName: dto.firstName,
        lastName: dto.lastName,
        passwordHash,
        phone: dto.phone,
        gender: dto.gender,
        branchId: dto.branchId,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        ...(dto.roleIds && {
          roles: {
            create: dto.roleIds.map((roleId) => ({ roleId })),
          },
        }),
      },
      include: {
        roles: { include: { role: true } },
        branch: true,
      },
    });

    // ── Sync to Keycloak (fire-and-forget) ───────────────────
    if (tenant) {
      const groupId = await this.kcAdmin.createOrGetGroup(tenant.subdomain, tenant.name);
      this.kcAdmin.createKcUser({
        dbUserId: user.id,
        tenantId,
        tenantSlug: tenant.subdomain,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: dto.roleIds?.[0] ?? 'CASHIER',
        password: dto.password,
        groupId,
      });
    }

    return user;
  }

  async findAllPlatform(query: PaginationDto) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const where = {
      ...(query.search && {
        OR: [
          { firstName: { contains: query.search, mode: 'insensitive' as const } },
          { lastName: { contains: query.search, mode: 'insensitive' as const } },
          { email: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          roles: { include: { role: true } },
          branch: true,
          tenant: { select: { id: true, name: true, plan: true, subdomain: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async findAll(tenantId: string, query: PaginationDto) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const where = {
      tenantId,
      ...(query.search && {
        OR: [
          { firstName: { contains: query.search, mode: 'insensitive' as const } },
          { lastName: { contains: query.search, mode: 'insensitive' as const } },
          { email: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { roles: { include: { role: true } }, branch: true },
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async findOne(id: string, tenantId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      include: {
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        branch: true,
        sessions: { where: { isActive: true }, take: 5, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, tenantId: string, dto: UpdateUserDto) {
    await this.findOne(id, tenantId);
    return this.prisma.user.update({
      where: { id },
      data: dto,
      include: { roles: { include: { role: true } }, branch: true },
    });
  }

  async updateStatus(id: string, tenantId: string, status: UserStatus) {
    await this.findOne(id, tenantId);
    const user = await this.prisma.user.update({ where: { id }, data: { status } });
    this.kcAdmin.updateKcUser(id, { isActive: status === UserStatus.ACTIVE });
    return user;
  }

  async updateStatusPlatform(id: string, status: UserStatus) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return this.updateStatus(id, user.tenantId, status);
  }

  async removePlatform(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return this.remove(id, user.tenantId);
  }

  async assignRoles(id: string, tenantId: string, roleIds: string[]) {
    await this.findOne(id, tenantId);
    await this.prisma.userRole.deleteMany({ where: { userId: id } });
    return this.prisma.userRole.createMany({
      data: roleIds.map((roleId) => ({ userId: id, roleId })),
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    this.kcAdmin.deleteKcUser(id);
    return this.prisma.user.delete({ where: { id } });
  }

  async getActivityLogs(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.activityLog.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
