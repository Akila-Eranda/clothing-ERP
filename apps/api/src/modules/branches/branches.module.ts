import { Module } from '@nestjs/common';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, NotFoundException } from '@nestjs/common';
import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RoleType } from '@prisma/client';
import { paginate, getPaginationArgs } from '@/shared/pagination.helper';
import { PaginationDto } from '@/common/dto/pagination.dto';

export class CreateBranchDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() code: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() state?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
}

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateBranchDto) {
    return this.prisma.branch.create({
      data: { tenantId, ...dto },
    });
  }

  async findAll(tenantId: string, query: PaginationDto) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const where = {
      tenantId,
      ...(query.search && { name: { contains: query.search, mode: 'insensitive' as const } }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.branch.findMany({
        where, skip, take,
        include: { _count: { select: { users: true, inventory: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.branch.count({ where }),
    ]);
    return paginate(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async findOne(id: string, tenantId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, tenantId },
      include: {
        users: { select: { id: true, firstName: true, lastName: true, status: true } },
        _count: { select: { inventory: true, sales: true } },
      },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }

  async update(id: string, tenantId: string, dto: Partial<CreateBranchDto>) {
    await this.findOne(id, tenantId);
    return this.prisma.branch.update({ where: { id }, data: dto as object });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.branch.delete({ where: { id } });
  }
}

@ApiTags('Branches')
@ApiBearerAuth('access-token')
@Controller({ path: 'branches', version: '1' })
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Post()
  @Roles(RoleType.SUPER_ADMIN, RoleType.TENANT_ADMIN)
  create(@CurrentUser() user: IAuthUser, @Body() dto: CreateBranchDto) {
    return this.branchesService.create(user.tenantId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: IAuthUser, @Query() query: PaginationDto) {
    return this.branchesService.findAll(user.tenantId, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.branchesService.findOne(id, user.tenantId);
  }

  @Put(':id')
  @Roles(RoleType.SUPER_ADMIN, RoleType.TENANT_ADMIN)
  update(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: Partial<CreateBranchDto>) {
    return this.branchesService.update(id, user.tenantId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(RoleType.SUPER_ADMIN, RoleType.TENANT_ADMIN)
  remove(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.branchesService.remove(id, user.tenantId);
  }
}

@Module({
  controllers: [BranchesController],
  providers: [BranchesService],
  exports: [BranchesService],
})
export class BranchesModule {}
