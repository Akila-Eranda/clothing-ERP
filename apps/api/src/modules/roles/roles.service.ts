import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { IsString, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoleType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { ensureSystemRoles } from './default-system-roles';

export class CreateRoleDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional({ enum: RoleType }) @IsOptional() type?: RoleType;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() permissionIds?: string[];
}

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateRoleDto) {
    const existing = await this.prisma.role.findFirst({ where: { tenantId, name: dto.name } });
    if (existing) throw new ConflictException(`Role "${dto.name}" already exists`);

    return this.prisma.role.create({
      data: {
        tenantId,
        name: dto.name,
        type: dto.type ?? RoleType.CUSTOM,
        description: dto.description,
        ...(dto.permissionIds && {
          permissions: {
            create: dto.permissionIds.map((permissionId) => ({ permissionId })),
          },
        }),
      },
      include: { permissions: { include: { permission: true } } },
    });
  }

  async findAll(tenantId: string) {
    await ensureSystemRoles(this.prisma, tenantId);
    return this.prisma.role.findMany({
      where: { tenantId },
      include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: { include: { permission: true } }, users: { include: { user: true } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async update(id: string, dto: Partial<CreateRoleDto>) {
    const role = await this.findOne(id);
    if (role.isSystem) throw new ConflictException('Cannot modify system roles');

    if (dto.permissionIds) {
      await this.prisma.rolePermission.deleteMany({ where: { roleId: id } });
      await this.prisma.rolePermission.createMany({
        data: dto.permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
      });
    }

    return this.prisma.role.update({
      where: { id },
      data: { name: dto.name, description: dto.description },
      include: { permissions: { include: { permission: true } } },
    });
  }

  async remove(id: string) {
    const role = await this.findOne(id);
    if (role.isSystem) throw new ConflictException('Cannot delete system roles');
    return this.prisma.role.delete({ where: { id } });
  }

  async getAllPermissions() {
    return this.prisma.permission.findMany({ orderBy: [{ resource: 'asc' }, { action: 'asc' }] });
  }

  async seedPermissions(tenantId: string) {
    const resources = ['users', 'roles', 'products', 'inventory', 'sales', 'customers', 'suppliers', 'purchases', 'accounting', 'hr', 'reports', 'branches', 'settings'];
    const actions = ['create', 'read', 'update', 'delete', 'export'];
    const perms = resources.flatMap((resource) =>
      actions.map((action) => ({ resource, action })),
    );
    await this.prisma.permission.createMany({ data: perms, skipDuplicates: true });
  }
}
