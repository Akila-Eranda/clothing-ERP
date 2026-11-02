import { Module } from '@nestjs/common';
import { RolesService } from './roles.service';
import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RoleType } from '@prisma/client';
import { RequireAnyPermissions } from '@/common/decorators/permissions.decorator';
import { CreateRoleDto, UpdateRoleDto } from './roles.service';

@ApiTags('Roles')
@ApiBearerAuth('access-token')
@Controller({ path: 'roles', version: '1' })
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @Roles(RoleType.SUPER_ADMIN, RoleType.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create role' })
  create(@CurrentUser() user: IAuthUser, @Body() dto: CreateRoleDto) {
    return this.rolesService.create(user.tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all roles' })
  findAll(@CurrentUser() user: IAuthUser) {
    return this.rolesService.findAll(user.tenantId);
  }

  @Get('permissions')
  @ApiOperation({ summary: 'Get all available permissions' })
  getPermissions() {
    return this.rolesService.getAllPermissions();
  }

  @Get(':id')
  @RequireAnyPermissions('roles:read', 'users:read')
  @ApiOperation({ summary: 'Get role by ID (own tenant only)' })
  findOne(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.rolesService.findOne(id, user.tenantId);
  }

  @Put(':id')
  @Roles(RoleType.SUPER_ADMIN, RoleType.TENANT_ADMIN)
  @ApiOperation({ summary: 'Update role (own tenant only)' })
  update(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.update(id, user.tenantId, dto);
  }

  @Delete(':id')
  @Roles(RoleType.SUPER_ADMIN, RoleType.TENANT_ADMIN)
  @ApiOperation({ summary: 'Delete role (own tenant only)' })
  remove(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.rolesService.remove(id, user.tenantId);
  }
}

@Module({
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
