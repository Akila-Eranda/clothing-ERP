import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { AdvancedAccountingService } from './advanced-accounting.service';

class CreateCostCenterDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() manager?: string;
}

class UpdateCostCenterDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() manager?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class BudgetLineDto {
  @IsString() accountId: string;
  @IsOptional() @IsString() costCenterId?: string;
  @IsInt() @Min(1) @Max(12) month: number;
  @IsNumber() @Min(0) amount: number;
  @IsOptional() @IsString() notes?: string;
}

class CreateBudgetDto {
  @IsString() name: string;
  @IsInt() @Min(2000) @Max(2200) fiscalYear: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => BudgetLineDto)
  lines?: BudgetLineDto[];
}

class ReplaceBudgetLinesDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => BudgetLineDto)
  lines: BudgetLineDto[];
}

class BudgetStatusDto {
  @IsIn(['DRAFT', 'APPROVED', 'ARCHIVED'])
  status: 'DRAFT' | 'APPROVED' | 'ARCHIVED';
}

class RecurringLineDto {
  @IsString() accountId: string;
  @IsIn(['DEBIT', 'CREDIT']) side: 'DEBIT' | 'CREDIT';
  @IsNumber() @Min(0.01) amount: number;
  @IsOptional() @IsString() description?: string;
}

class CreateRecurringDto {
  @IsString() name: string;
  @IsString() description: string;
  @IsIn(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']) frequency: string;
  @IsDateString() startDate: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsDateString() nextRunDate?: string;
  @IsOptional() @IsBoolean() autoPost?: boolean;
  @IsOptional() @IsString() branchId?: string;
  @IsArray() @ArrayMinSize(2) @ValidateNested({ each: true }) @Type(() => RecurringLineDto)
  lines: RecurringLineDto[];
}

class UpdateRecurringDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() autoPost?: boolean;
  @IsOptional() @IsDateString() nextRunDate?: string;
}

class CreateExchangeRateDto {
  @IsString() fromCurrency: string;
  @IsString() toCurrency: string;
  @IsNumber() @Min(0.000001) rate: number;
  @IsOptional() @IsDateString() effectiveAt?: string;
  @IsOptional() @IsString() source?: string;
}

@ApiTags('Advanced Accounting')
@ApiBearerAuth()
@Controller('accounting/advanced')
export class AdvancedAccountingController {
  constructor(private readonly advanced: AdvancedAccountingService) {}

  @Get('dashboard')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Advanced accounting command-center metrics' })
  dashboard(@CurrentUser() user: IAuthUser) {
    return this.advanced.dashboard(user.tenantId);
  }

  @Get('cost-centers')
  @RequirePermissions('accounting:read')
  listCostCenters(@CurrentUser() user: IAuthUser, @Query('includeInactive') includeInactive?: string) {
    return this.advanced.listCostCenters(user.tenantId, includeInactive === 'true');
  }

  @Post('cost-centers')
  @RequirePermissions('accounting:create')
  createCostCenter(@CurrentUser() user: IAuthUser, @Body() dto: CreateCostCenterDto) {
    return this.advanced.createCostCenter(user.tenantId, dto);
  }

  @Put('cost-centers/:id')
  @RequirePermissions('accounting:update')
  updateCostCenter(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCostCenterDto,
  ) {
    return this.advanced.updateCostCenter(user.tenantId, id, dto);
  }

  @Get('budgets')
  @RequirePermissions('accounting:read')
  listBudgets(@CurrentUser() user: IAuthUser, @Query('fiscalYear') fiscalYear?: string) {
    return this.advanced.listBudgets(user.tenantId, fiscalYear ? Number(fiscalYear) : undefined);
  }

  @Post('budgets')
  @RequirePermissions('accounting:create')
  createBudget(@CurrentUser() user: IAuthUser, @Body() dto: CreateBudgetDto) {
    return this.advanced.createBudget(user.tenantId, user.id, dto);
  }

  @Put('budgets/:id/lines')
  @RequirePermissions('accounting:update')
  replaceBudgetLines(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() dto: ReplaceBudgetLinesDto,
  ) {
    return this.advanced.replaceBudgetLines(user.tenantId, id, dto.lines);
  }

  @Put('budgets/:id/status')
  @RequirePermissions('accounting:update')
  setBudgetStatus(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() dto: BudgetStatusDto,
  ) {
    return this.advanced.setBudgetStatus(user.tenantId, id, user.id, dto.status);
  }

  @Get('budget-variance')
  @RequirePermissions('accounting:read')
  budgetVariance(@CurrentUser() user: IAuthUser, @Query('fiscalYear') fiscalYear?: string) {
    return this.advanced.budgetVariance(user.tenantId, Number(fiscalYear) || new Date().getUTCFullYear());
  }

  @Get('recurring-journals')
  @RequirePermissions('accounting:read')
  listRecurring(@CurrentUser() user: IAuthUser) {
    return this.advanced.listRecurring(user.tenantId);
  }

  @Post('recurring-journals')
  @RequirePermissions('accounting:create')
  createRecurring(@CurrentUser() user: IAuthUser, @Body() dto: CreateRecurringDto) {
    return this.advanced.createRecurring(user.tenantId, user.id, dto);
  }

  @Put('recurring-journals/:id')
  @RequirePermissions('accounting:update')
  updateRecurring(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRecurringDto,
  ) {
    return this.advanced.updateRecurring(user.tenantId, id, dto);
  }

  @Post('recurring-journals/:id/run')
  @RequirePermissions('accounting:create')
  runRecurring(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.advanced.runRecurring(user.tenantId, id, user.id);
  }

  @Get('exchange-rates')
  @RequirePermissions('accounting:read')
  listExchangeRates(@CurrentUser() user: IAuthUser) {
    return this.advanced.listExchangeRates(user.tenantId);
  }

  @Post('exchange-rates')
  @RequirePermissions('accounting:create')
  createExchangeRate(@CurrentUser() user: IAuthUser, @Body() dto: CreateExchangeRateDto) {
    return this.advanced.createExchangeRate(user.tenantId, user.id, dto);
  }

  @Get('convert')
  @RequirePermissions('accounting:read')
  convert(
    @CurrentUser() user: IAuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('amount') amount: string,
    @Query('at') at?: string,
  ) {
    return this.advanced.convertCurrency(
      user.tenantId,
      from,
      to,
      Number(amount),
      at ? new Date(at) : new Date(),
    );
  }

  @Get('forecast')
  @RequirePermissions('accounting:read')
  forecast(@CurrentUser() user: IAuthUser, @Query('months') months?: string) {
    return this.advanced.forecast(user.tenantId, Number(months) || 6);
  }

  @Get('consolidation')
  @RequirePermissions('accounting:read')
  consolidation(
    @CurrentUser() user: IAuthUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.advanced.consolidation(user.tenantId, startDate, endDate);
  }

  @Get('diagnostics')
  @RequirePermissions('accounting:read')
  diagnostics(@CurrentUser() user: IAuthUser) {
    return this.advanced.diagnostics(user.tenantId);
  }
}
