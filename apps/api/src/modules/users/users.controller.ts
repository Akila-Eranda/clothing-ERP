import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, HttpCode, HttpStatus, ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, UpdateUserStatusDto, AssignUserRolesDto } from './dto/create-user.dto';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { RoleType, UserStatus } from '@prisma/client';
import { PLATFORM_ADMIN_ROLES } from '@/shared/platform-admin-roles';

export class PlatformUsersQueryDto extends PaginationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() tenantId?: string;
  @ApiPropertyOptional({ description: 'Tenant id or subdomain' }) @IsOptional() @IsString() tenant?: string;
}

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(RoleType.SUPER_ADMIN, RoleType.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create new user' })
  create(@CurrentUser() user: IAuthUser, @Body() dto: CreateUserDto) {
    return this.usersService.create(user.tenantId, dto);
  }

  @Get('platform')
  @Roles(...PLATFORM_ADMIN_ROLES)
  @ApiOperation({ summary: 'List all users across tenants (Platform Admin)' })
  findAllPlatform(
    // Declared in a DTO: separate @Query('tenantId') params were rejected with 400 (forbidNonWhitelisted).
    @Query() query: PlatformUsersQueryDto,
  ) {
    const { tenantId, tenant, ...page } = query;
    return this.usersService.findAllPlatform(page, tenantId || tenant);
  }

  @Get()
  @RequirePermissions('users:read')
  @ApiOperation({ summary: 'List all users with pagination' })
  findAll(@CurrentUser() user: IAuthUser, @Query() query: PaginationDto) {
    return this.usersService.findAll(user.tenantId, query);
  }

  @Get(':id')
  @RequirePermissions('users:read')
  @ApiOperation({ summary: 'Get user by ID' })
  findOne(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.usersService.findOne(id, user.tenantId);
  }

  @Put(':id')
  @Patch(':id')
  @ApiOperation({ summary: 'Update user' })
  update(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    const isSelf = user.id === id;
    const canUpdateOthers =
      user.roles.includes(RoleType.SUPER_ADMIN) ||
      user.roles.includes(RoleType.TENANT_ADMIN) ||
      user.permissions.includes('users:update');
    if (!isSelf && !canUpdateOthers) {
      throw new ForbiddenException('Insufficient permissions. Required: [users:update]');
    }
    return this.usersService.update(id, user.tenantId, dto);
  }

  @Patch(':id/status')
  @Roles(RoleType.SUPER_ADMIN, RoleType.PLATFORM_STAFF, RoleType.TENANT_ADMIN)
  @ApiOperation({ summary: 'Update user status' })
  updateStatus(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() body: UpdateUserStatusDto,
  ) {
    if (user.roles.includes(RoleType.SUPER_ADMIN) || user.roles.includes(RoleType.PLATFORM_STAFF)) {
      return this.usersService.updateStatusPlatform(id, body.status);
    }
    return this.usersService.updateStatus(id, user.tenantId, body.status);
  }

  @Patch(':id/roles')
  @Roles(RoleType.SUPER_ADMIN, RoleType.TENANT_ADMIN)
  @ApiOperation({ summary: 'Assign roles to user' })
  assignRoles(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() body: AssignUserRolesDto,
  ) {
    return this.usersService.assignRoles(id, user.tenantId, body.roleIds);
  }

  @Get(':id/activity')
  @RequirePermissions('users:read')
  @ApiOperation({ summary: 'Get user activity logs' })
  getActivity(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.usersService.getActivityLogs(id, user.tenantId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(RoleType.SUPER_ADMIN, RoleType.PLATFORM_STAFF, RoleType.TENANT_ADMIN)
  @ApiOperation({ summary: 'Delete user' })
  remove(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    if (user.roles.includes(RoleType.SUPER_ADMIN) || user.roles.includes(RoleType.PLATFORM_STAFF)) {
      return this.usersService.removePlatform(id);
    }
    return this.usersService.remove(id, user.tenantId);
  }
}
