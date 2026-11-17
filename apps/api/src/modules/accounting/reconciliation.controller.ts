import { Controller, Get, ForbiddenException, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { resolveBranchScope } from '@/shared/branch-scope.helper';
import { ReconciliationService } from './reconciliation.service';

export class ReconciliationQueryDto {
  @ApiPropertyOptional({ description: 'Branch scope for branch-aware checks' })
  @IsOptional() @IsString()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Inclusive ISO date for source transactions' })
  @IsOptional() @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Inclusive ISO date for source transactions' })
  @IsOptional() @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ enum: ['OK', 'MISMATCH', 'NOT_CHECKED', 'DECISION_REQUIRED'] })
  @IsOptional() @IsIn(['OK', 'MISMATCH', 'NOT_CHECKED', 'DECISION_REQUIRED'])
  status?: string;
}

/** GET /api/v1/accounting/reconciliation - read-only; changes nothing. */
@ApiTags('Accounting')
@ApiBearerAuth('access-token')
@Controller({ path: 'accounting/reconciliation', version: '1' })
export class ReconciliationController {
  constructor(private readonly svc: ReconciliationService) {}

  @Get()
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Full accounting reconciliation (read-only report of source A vs source B checks)' })
  run(@CurrentUser() user: IAuthUser, @Query() query: ReconciliationQueryDto) {
    const privileged = (user.roles ?? []).some((role) => ['SUPER_ADMIN', 'TENANT_ADMIN'].includes(role));
    if (user.branchId && query.branchId && query.branchId !== user.branchId && !privileged) {
      throw new ForbiddenException('You can only reconcile your assigned branch');
    }
    return this.svc.run(user.tenantId, {
      ...query,
      branchId: resolveBranchScope(user, query.branchId),
    });
  }
}
