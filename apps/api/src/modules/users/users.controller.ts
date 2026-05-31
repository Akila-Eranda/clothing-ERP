import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto/create-user.dto';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { RoleType, UserStatus } from '@prisma/client';

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
  @Roles(RoleType.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all users across tenants (Super Admin)' })
  findAllPlatform(@Query() query: PaginationDto) {
    return this.usersService.findAllPlatform(query);
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
  @RequirePermissions('users:update')
  @ApiOperation({ summary: 'Update user' })
  update(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, user.tenantId, dto);
  }

  @Patch(':id/status')
  @Roles(RoleType.SUPER_ADMIN, RoleType.TENANT_ADMIN)
  @ApiOperation({ summary: 'Update user status' })
  updateStatus(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body('status') status: UserStatus,
  ) {
    if (user.roles.includes(RoleType.SUPER_ADMIN)) {
      return this.usersService.updateStatusPlatform(id, status);
    }
    return this.usersService.updateStatus(id, user.tenantId, status);
  }

  @Patch(':id/roles')
  @Roles(RoleType.SUPER_ADMIN, RoleType.TENANT_ADMIN)
  @ApiOperation({ summary: 'Assign roles to user' })
  assignRoles(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body('roleIds') roleIds: string[],
  ) {
    return this.usersService.assignRoles(id, user.tenantId, roleIds);
  }

  @Get(':id/activity')
  @RequirePermissions('users:read')
  @ApiOperation({ summary: 'Get user activity logs' })
  getActivity(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.usersService.getActivityLogs(id, user.tenantId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(RoleType.SUPER_ADMIN, RoleType.TENANT_ADMIN)
  @ApiOperation({ summary: 'Delete user' })
  remove(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    if (user.roles.includes(RoleType.SUPER_ADMIN)) {
      return this.usersService.removePlatform(id);
    }
    return this.usersService.remove(id, user.tenantId);
  }
}
