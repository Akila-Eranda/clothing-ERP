import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { IsString, IsOptional, IsArray, IsIn, MaxLength, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { RoleType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { SAFE_USER_SELECT } from '@/shared/security/sensitive-fields';
import { isPlatformRoleType, TENANT_ASSIGNABLE_ROLE_TYPES } from '@/shared/platform-admin-roles';
import { ensureSystemRoles } from './default-system-roles';

export class CreateRoleDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(80) name: string;
  @ApiPropertyOptional({ enum: TENANT_ASSIGNABLE_ROLE_TYPES })
  @IsOptional() @IsIn(TENANT_ASSIGNABLE_ROLE_TYPES, { message: 'Role type is not allowed for shop roles' })
  type?: RoleType;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) permissionIds?: string[];
}

/** Role type cannot change after creation. */
export class UpdateRoleDto extends PartialType(OmitType(CreateRoleDto, ['type'] as const)) {}

const ROLE_DETAIL_INCLUDE = {
  permissions: { include: { permission: true } },
  users: { include: { user: { select: SAFE_USER_SELECT } } },
} as const;

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateRoleDto) {
    if (isPlatformRoleType(dto.type)) {
      throw new ForbiddenException('Platform roles cannot be created by a shop');
    }
    const existing = await this.prisma.role.findFirst({ where: { tenantId, name: dto.name } });
    if (existing) throw new ConflictException(`Role "${dto.name}" already exists`);
    await this.assertPermissionsExist(dto.permissionIds);

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

  /** Tenant-scoped: a role id from another tenant is reported as not found. */
  async findOne(id: string, tenantId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, tenantId },
      include: ROLE_DETAIL_INCLUDE,
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async update(id: string, tenantId: string, dto: UpdateRoleDto) {
    const role = await this.findOne(id, tenantId);
    if (role.isSystem) throw new ConflictException('Cannot modify system roles');
    if (isPlatformRoleType(role.type)) throw new ForbiddenException('Platform roles cannot be modified by a shop');
    await this.assertPermissionsExist(dto.permissionIds);

    return this.prisma.$transaction(async (tx) => {
      if (dto.permissionIds) {
        await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
        await tx.rolePermission.createMany({
          data: dto.permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
        });
      }
      return tx.role.update({
        where: { id: role.id },
        data: { name: dto.name, description: dto.description },
        include: { permissions: { include: { permission: true } } },
      });
    });
  }

  async remove(id: string, tenantId: string) {
    const role = await this.findOne(id, tenantId);
    if (role.isSystem) throw new ConflictException('Cannot delete system roles');
    if (isPlatformRoleType(role.type)) throw new ForbiddenException('Platform roles cannot be deleted by a shop');
    return this.prisma.role.delete({ where: { id: role.id } });
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

  private async assertPermissionsExist(permissionIds: string[] | undefined) {
    if (!permissionIds?.length) return;
    const unique = [...new Set(permissionIds)];
    const count = await this.prisma.permission.count({ where: { id: { in: unique } } });
    if (count !== unique.length) throw new NotFoundException('One or more permissions do not exist');
  }
}
