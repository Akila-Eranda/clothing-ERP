import { Module, NotFoundException } from '@nestjs/common';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IsString, IsOptional, IsNumber, IsEnum, IsDateString, IsBoolean, ValidateNested, IsArray, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AccountType,
  BankAccountType,
  BankTxnType,
  ChequeDirection,
  ChequeStatus,
  JournalEntryStatus,
  PaymentMethod,
  ExpenseClaimStatus,
  DepreciationMethod,
  FixedAssetStatus,
  PayrollComponentType,
  TaxDirection,
  NumberSeriesResetPolicy,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { paginate, getPaginationArgs } from '@/shared/pagination.helper';
import { FinanceService } from './finance.service';
import { FinancialPeriodsService } from './financial-periods.service';
import { JournalEntriesService } from './journal-entries.service';
import { AccountingBootstrapService } from './accounting-bootstrap.service';
import { AccountingPostingService } from './accounting-posting.service';
import { AccountingOutboxService } from './accounting-outbox.service';
import { AccountingAutomationListener } from './accounting-automation.listener';
import { AdvancedAccountingService } from './advanced-accounting.service';
import { AdvancedAccountingController } from './advanced-accounting.controller';
import { TaxService } from './tax.service';
import { PettyCashService } from './petty-cash.service';
import { FixedAssetsService } from './fixed-assets.service';
import { PayrollService } from './payroll.service';
import { FinancialReportsService } from './financial-reports.service';
import { AccountingSettingsService } from './accounting-settings.service';
import { EXPENSE_CATEGORIES, normalizeExpenseCategory } from './expense-categories';
import { chequeSourceNotes } from './finance.helper';
import { AuditLogModule } from '@/modules/audit-log/audit-log.module';
import { CustomersModule } from '@/modules/customers/customers.module';
import { SuppliersModule } from '@/modules/suppliers/suppliers.module';
import type { Response } from 'express';
import {
  assertCodeInTypeRange,
  assertValidParent,
  buildAccountTree,
  collectDescendantIds,
  flattenAccountTree,
  normalizeAccountCode,
  parseCoaImportRow,
  suggestNextAccountCode,
  COA_TYPE_RANGES,
} from './coa.helper';
import * as dayjs from 'dayjs';

export class CreateAccountDto {
  @ApiPropertyOptional({ description: 'Auto-generated if omitted' })
  @IsOptional() @IsString() code?: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: AccountType }) @IsEnum(AccountType) type: AccountType;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() parentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() openingBalance?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() openingBalanceDate?: string;
}

export class UpdateAccountDto {
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional({ enum: AccountType }) @IsOptional() @IsEnum(AccountType) type?: AccountType;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() parentId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsNumber() openingBalance?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() openingBalanceDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ImportAccountsDto {
  @ApiProperty({ type: [Object] })
  @IsArray()
  rows: Record<string, string>[];
}

export class CreateFiscalYearDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsDateString() startDate: string;
  @ApiProperty() @IsDateString() endDate: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() setCurrent?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() retainedEarningsAccountId?: string;
}

export class UpdateFiscalYearDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() setCurrent?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() retainedEarningsAccountId?: string | null;
}

export class ClosePeriodDto {
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CloseFiscalYearDto {
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoClosePeriods?: boolean;
}

export class CreateExpenseDto {
  @ApiProperty() @IsNumber() amount: number;
  @ApiProperty() @IsString() description: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiPropertyOptional({ enum: EXPENSE_CATEGORIES }) @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional({ enum: PaymentMethod }) @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod;
  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
  @ApiPropertyOptional({ description: 'Required when paymentMethod is CHEQUE' })
  @IsOptional() @IsString() chequeNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chequeBankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() chequeDueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chequeBankAccountId?: string;
}

export class UpdateExpenseDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() amount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() date?: string;
  @ApiPropertyOptional({ enum: EXPENSE_CATEGORIES }) @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional({ enum: PaymentMethod }) @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod;
  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
}

export class JournalLineDto {
  @ApiProperty() @IsString() debitAccountId: string;
  @ApiProperty() @IsString() creditAccountId: string;
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class GlJournalLineDto {
  @ApiProperty() @IsString() accountId: string;
  @ApiProperty({ enum: ['DEBIT', 'CREDIT'] }) @IsString() side: 'DEBIT' | 'CREDIT';
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class CreateJournalEntryDto {
  @ApiProperty() @IsString() description: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiPropertyOptional() @IsOptional() @IsString() referenceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() referenceType?: string;
  @ApiPropertyOptional({ type: [JournalLineDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => JournalLineDto) lines?: JournalLineDto[];
  @ApiPropertyOptional({ type: [GlJournalLineDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => GlJournalLineDto) glLines?: GlJournalLineDto[];
  @ApiPropertyOptional({ enum: ['DRAFT', 'SUBMIT', 'POST'] }) @IsOptional() @IsString() action?: 'DRAFT' | 'SUBMIT' | 'POST';
}

export class UpdateJournalEntryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() date?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() referenceId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() referenceType?: string | null;
  @ApiPropertyOptional({ type: [JournalLineDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => JournalLineDto) lines?: JournalLineDto[];
  @ApiPropertyOptional({ type: [GlJournalLineDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => GlJournalLineDto) glLines?: GlJournalLineDto[];
}

export class VoidJournalDto {
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class RejectJournalDto {
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class CreateBankAccountDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional({ enum: BankAccountType }) @IsOptional() @IsEnum(BankAccountType) type?: BankAccountType;
  @ApiPropertyOptional() @IsOptional() @IsString() bankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accountNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() openingBalance?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() glAccountId?: string;
}

export class UpdateBankAccountDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accountNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() glAccountId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateBankTxnDto {
  @ApiProperty() @IsString() bankAccountId: string;
  @ApiProperty({ enum: BankTxnType }) @IsEnum(BankTxnType) type: BankTxnType;
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() txnDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contraGlAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() postToGl?: boolean;
}

export class BankTransferDto {
  @ApiProperty() @IsString() fromAccountId: string;
  @ApiProperty() @IsString() toAccountId: string;
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() txnDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() postToGl?: boolean;
}

export class CreateChequeDto {
  @ApiProperty({ enum: ChequeDirection }) @IsEnum(ChequeDirection) direction: ChequeDirection;
  @ApiProperty() @IsString() chequeNumber: string;
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() bankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() issueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() partyType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() partyId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() partyName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateChequeStatusDto {
  @ApiProperty({ enum: ChequeStatus }) @IsEnum(ChequeStatus) status: ChequeStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() bankAccountId?: string;
}

export class StartReconciliationDto {
  @ApiProperty() @IsString() bankAccountId: string;
  @ApiProperty() @IsDateString() statementDate: string;
  @ApiProperty() @IsNumber() statementBalance: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CompleteReconciliationDto {
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) matchedTxnIds?: string[];
}

export class CashBookEntryDto {
  @ApiProperty() @IsString() type: string;
  @ApiProperty() @IsString() description: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() entryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() debit?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() credit?: number;
  @ApiPropertyOptional({ enum: PaymentMethod }) @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod;
  @ApiPropertyOptional() @IsOptional() @IsString() referenceType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() referenceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contraGlAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() postToGl?: boolean;
}

export class CreateTaxRateDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsNumber() rate: number;
  @ApiPropertyOptional({ enum: TaxDirection }) @IsOptional() @IsEnum(TaxDirection) direction?: TaxDirection;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isInclusive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() outputGlAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() inputGlAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveTo?: string;
}

export class UpdateTaxRateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() rate?: number;
  @ApiPropertyOptional({ enum: TaxDirection }) @IsOptional() @IsEnum(TaxDirection) direction?: TaxDirection;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isInclusive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() outputGlAccountId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() inputGlAccountId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveFrom?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveTo?: string | null;
}

export class CreateVatReturnDto {
  @ApiProperty() @IsDateString() startDate: string;
  @ApiProperty() @IsDateString() endDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() branchId?: string;
}

export class FileVatReturnDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() postJournal?: boolean;
}

export class CreatePettyFundDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() floatAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() openingBalance?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() glAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() linkBankAccount?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() postToGl?: boolean;
}

export class UpdatePettyFundDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() floatAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() glAccountId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class PettyDisbursementDto {
  @ApiProperty() @IsString() fundId: string;
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiProperty() @IsString() description: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() txnDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() expenseGlAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() receiptRef?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() postToGl?: boolean;
}

export class PettyReplenishDto {
  @ApiProperty() @IsString() fundId: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0.01) amount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() txnDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fromBankAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() postToGl?: boolean;
}

export class CreateExpenseClaimDto {
  @ApiProperty() @IsString() claimantName: string;
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiProperty() @IsString() description: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() claimDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fundId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() employeeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() expenseGlAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() receiptRef?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() submit?: boolean;
}

export class RejectClaimDto {
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class ReimburseClaimDto {
  @ApiProperty() @IsString() claimId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fundId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() payFromBankAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() payDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() postToGl?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() payFromPettyCash?: boolean;
}

export class CreateFixedAssetCategoryDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() usefulLifeMonths?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() residualValuePct?: number;
  @ApiPropertyOptional({ enum: DepreciationMethod }) @IsOptional() @IsEnum(DepreciationMethod) method?: DepreciationMethod;
  @ApiPropertyOptional() @IsOptional() @IsNumber() decliningRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() assetGlAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accumDepGlAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() depExpenseGlAccountId?: string;
}

export class CreateFixedAssetDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsDateString() acquisitionDate: string;
  @ApiProperty() @IsNumber() @Min(0.01) cost: number;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() residualValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() usefulLifeMonths?: number;
  @ApiPropertyOptional({ enum: DepreciationMethod }) @IsOptional() @IsEnum(DepreciationMethod) method?: DepreciationMethod;
  @ApiPropertyOptional() @IsOptional() @IsNumber() decliningRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serialNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vendorName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() assetGlAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accumDepGlAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() depExpenseGlAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() postAcquisitionJournal?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() contraGlAccountId?: string;
}

export class UpdateFixedAssetDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() serialNumber?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() vendorName?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsNumber() usefulLifeMonths?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() residualValue?: number;
  @ApiPropertyOptional({ enum: DepreciationMethod }) @IsOptional() @IsEnum(DepreciationMethod) method?: DepreciationMethod;
  @ApiPropertyOptional() @IsOptional() @IsNumber() decliningRate?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsString() assetGlAccountId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() accumDepGlAccountId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() depExpenseGlAccountId?: string | null;
}

export class RunDepreciationDto {
  @ApiProperty() @IsNumber() year: number;
  @ApiProperty() @IsNumber() @Min(1) month: number;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) assetIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() postToGl?: boolean;
}

export class DisposeFixedAssetDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() disposalDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() proceeds?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() proceedsGlAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() gainLossGlAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() postToGl?: boolean;
}

export class TransferFixedAssetDto {
  @ApiPropertyOptional() @IsOptional() @IsString() toBranchId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() toLocation?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() transferDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdatePayrollSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() epfEmployeeRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() epfEmployerRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() etfEmployerRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() epfWageCap?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsString() salaryExpenseGlId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() epfExpenseGlId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() etfExpenseGlId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() epfPayableGlId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() etfPayableGlId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() bankGlId?: string | null;
}

export class UpdateNumberSeriesDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() prefix?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeYear?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() includeMonth?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumber() padLength?: number;
  @ApiPropertyOptional({ enum: NumberSeriesResetPolicy })
  @IsOptional() @IsEnum(NumberSeriesResetPolicy) resetPolicy?: NumberSeriesResetPolicy;
  @ApiPropertyOptional() @IsOptional() @IsNumber() nextValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string | null;
}

export class UpdateAccountingPreferencesDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requireJournalApproval?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowPostDraft?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() blockPostingClosedPeriod?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoPostEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() repairVatEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumber() fiscalYearStartMonth?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() decimalPlaces?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() defaultCashAccountId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() defaultArAccountId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() defaultApAccountId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() defaultSalesAccountId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() defaultPurchaseAccountId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() defaultRetainedEarningsId?: string | null;
}

export class UpsertAccountMappingDto {
  @ApiProperty() @IsString() key: string;
  @ApiProperty() @IsString() accountId: string;
}

export class BulkAccountMappingsDto {
  @ApiProperty({ type: [UpsertAccountMappingDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertAccountMappingDto)
  mappings: UpsertAccountMappingDto[];
}

export class CreatePayrollComponentDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: PayrollComponentType }) @IsEnum(PayrollComponentType) type: PayrollComponentType;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isEpfApplicable?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPercent?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumber() defaultAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() percentOfBasic?: number;
}

export class ProcessPayrollRunDto {
  @ApiProperty() @IsNumber() @Min(1) month: number;
  @ApiProperty() @IsNumber() year: number;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) employeeIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsNumber() bonus?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class PayPayrollRunDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() postToGl?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() paymentMethod?: string;
}

export class UpdateEmployeeStatutoryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() epfNumber?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() etfNumber?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() nicNumber?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsNumber() basicSalary?: number;
}

export class TaxPreviewDto {
  @ApiProperty() @IsNumber() amount: number;
  @ApiProperty() @IsNumber() rate: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() inclusive?: boolean;
}

@Injectable()
export class AccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
    private readonly periods: FinancialPeriodsService,
    private readonly journals: JournalEntriesService,
    private readonly bootstrap: AccountingBootstrapService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private static readonly SETTLED_RETURN_STATUSES = ['APPROVED', 'COMPLETED', 'REFUND_PROCESSED'] as const;

  private balanceDelta(type: AccountType, amount: number, isDebit: boolean): number {
    const debitNormal = type === AccountType.ASSET || type === AccountType.EXPENSE;
    if (isDebit) return debitNormal ? amount : -amount;
    return debitNormal ? -amount : amount;
  }

  async getAccounts(
    tenantId: string,
    query: { type?: AccountType; q?: string; includeInactive?: boolean; flat?: boolean } = {},
  ) {
    const rows = await this.prisma.account.findMany({
      where: {
        tenantId,
        ...(query.includeInactive ? {} : { isActive: true }),
        ...(query.type ? { type: query.type } : {}),
        ...(query.q
          ? {
              OR: [
                { code: { contains: query.q, mode: 'insensitive' } },
                { name: { contains: query.q, mode: 'insensitive' } },
                { description: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { code: 'asc' },
    });

    const tree = buildAccountTree(rows);
    if (query.flat) {
      return {
        types: COA_TYPE_RANGES,
        data: flattenAccountTree(tree),
        total: rows.length,
      };
    }
    return {
      types: COA_TYPE_RANGES,
      data: tree,
      total: rows.length,
    };
  }

  async getNextAccountCode(tenantId: string, type: AccountType, parentId?: string) {
    if (!type || !Object.values(AccountType).includes(type)) {
      throw new BadRequestException('Valid account type is required');
    }
    let parentCode: string | null = null;
    if (parentId) {
      const parent = await this.prisma.account.findFirst({ where: { id: parentId, tenantId } });
      if (!parent) throw new NotFoundException('Parent account not found');
      if (parent.type !== type) {
        throw new BadRequestException('Parent must be the same account type');
      }
      parentCode = parent.code;
    }
    const existing = await this.prisma.account.findMany({
      where: { tenantId, type },
      select: { code: true },
    });
    const code = suggestNextAccountCode({
      type,
      existingCodes: existing.map((e) => e.code),
      parentCode,
    });
    return { code, type, range: COA_TYPE_RANGES[type] };
  }

  private async validateParent(
    tenantId: string,
    type: AccountType,
    parentId: string | null | undefined,
    accountId?: string,
  ) {
    if (!parentId) return null;
    const parent = await this.prisma.account.findFirst({
      where: { id: parentId, tenantId },
      select: { id: true, type: true, isActive: true, code: true },
    });
    let descendantIds: Set<string> | undefined;
    if (accountId) {
      const all = await this.prisma.account.findMany({
        where: { tenantId },
        select: { id: true, parentId: true },
      });
      descendantIds = collectDescendantIds(accountId, all);
    }
    assertValidParent({ parentId, accountId, parent, type, descendantIds });
    return parent;
  }

  async createAccount(tenantId: string, userId: string, dto: CreateAccountDto) {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Account name is required');

    await this.validateParent(tenantId, dto.type, dto.parentId);

    let code = dto.code ? normalizeAccountCode(dto.code) : '';
    if (!code) {
      const next = await this.getNextAccountCode(tenantId, dto.type, dto.parentId);
      code = next.code;
    } else {
      assertCodeInTypeRange(code, dto.type);
    }

    const dup = await this.prisma.account.findFirst({ where: { tenantId, code } });
    if (dup) throw new BadRequestException(`Account code ${code} already exists`);

    const openingBalance = Number(dto.openingBalance ?? 0);
    if (Number.isNaN(openingBalance)) throw new BadRequestException('Invalid opening balance');

    return this.prisma.account.create({
      data: {
        tenantId,
        code,
        name,
        type: dto.type,
        description: dto.description?.trim() || null,
        parentId: dto.parentId || null,
        openingBalance,
        openingBalanceDate: dto.openingBalanceDate
          ? new Date(dto.openingBalanceDate)
          : openingBalance !== 0
            ? new Date()
            : null,
        balance: openingBalance,
        isSystem: false,
        isActive: true,
      },
    });
  }

  async updateAccount(id: string, tenantId: string, dto: UpdateAccountDto) {
    const account = await this.prisma.account.findFirst({ where: { id, tenantId } });
    if (!account) throw new NotFoundException('Account not found');
    if (account.isSystem && (dto.code || dto.type || dto.parentId !== undefined)) {
      throw new BadRequestException('System accounts cannot change code, type, or parent');
    }

    const nextType = dto.type ?? account.type;
    if (dto.parentId !== undefined) {
      await this.validateParent(tenantId, nextType, dto.parentId, id);
    } else if (dto.type && dto.type !== account.type && account.parentId) {
      await this.validateParent(tenantId, nextType, account.parentId, id);
    }

    let code = account.code;
    if (dto.code) {
      code = normalizeAccountCode(dto.code);
      assertCodeInTypeRange(code, nextType);
      const dup = await this.prisma.account.findFirst({
        where: { tenantId, code, NOT: { id } },
      });
      if (dup) throw new BadRequestException(`Account code ${code} already exists`);
    } else if (dto.type && dto.type !== account.type) {
      assertCodeInTypeRange(code, nextType);
    }

    const openingBalance =
      dto.openingBalance !== undefined ? Number(dto.openingBalance) : undefined;
    if (openingBalance !== undefined && Number.isNaN(openingBalance)) {
      throw new BadRequestException('Invalid opening balance');
    }

    // Adjust running balance by opening-balance delta when no journals yet
    let balancePatch: number | undefined;
    if (openingBalance !== undefined && openingBalance !== account.openingBalance) {
      const lineCount = await this.prisma.journalLine.count({
        where: { OR: [{ debitAccountId: id }, { creditAccountId: id }] },
      });
      if (lineCount === 0) {
        balancePatch = openingBalance;
      } else {
        const delta = openingBalance - account.openingBalance;
        balancePatch = account.balance + delta;
      }
    }

    return this.prisma.account.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.code && { code }),
        ...(dto.type && { type: dto.type }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.parentId !== undefined && { parentId: dto.parentId || null }),
        ...(openingBalance !== undefined && { openingBalance }),
        ...(dto.openingBalanceDate !== undefined && {
          openingBalanceDate: dto.openingBalanceDate ? new Date(dto.openingBalanceDate) : null,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(balancePatch !== undefined && { balance: balancePatch }),
      },
    });
  }

  async deleteAccount(id: string, tenantId: string) {
    const account = await this.prisma.account.findFirst({ where: { id, tenantId } });
    if (!account) throw new NotFoundException('Account not found');
    if (account.isSystem) throw new BadRequestException('System accounts cannot be deleted');

    const childCount = await this.prisma.account.count({
      where: { tenantId, parentId: id, isActive: true },
    });
    if (childCount > 0) {
      throw new BadRequestException('Deactivate or reassign child accounts first');
    }

    const lineCount = await this.prisma.journalLine.count({
      where: { OR: [{ debitAccountId: id }, { creditAccountId: id }] },
    });
    if (lineCount > 0) {
      throw new BadRequestException('Cannot delete an account that has journal entries');
    }
    return this.prisma.account.update({ where: { id }, data: { isActive: false } });
  }

  async seedDefaultCoa(tenantId: string) {
    return this.bootstrap.bootstrapTenant(tenantId);
  }

  async exportAccounts(tenantId: string) {
    const rows = await this.prisma.account.findMany({
      where: { tenantId, isActive: true },
      orderBy: { code: 'asc' },
      include: { parent: { select: { code: true } } },
    });
    return rows.map((r) => ({
      code: r.code,
      name: r.name,
      type: r.type,
      parentCode: r.parent?.code ?? '',
      description: r.description ?? '',
      openingBalance: r.openingBalance,
      balance: r.balance,
    }));
  }

  async importAccounts(tenantId: string, rows: Record<string, string>[]) {
    if (!rows?.length) throw new BadRequestException('No rows to import');
    const parsed = rows.map(parseCoaImportRow);
    // Parents first (no parentCode), then children
    parsed.sort((a, b) => Number(!!a.parentCode) - Number(!!b.parentCode));

    let created = 0;
    let updated = 0;
    const codeToId = new Map<string, string>();
    const existing = await this.prisma.account.findMany({
      where: { tenantId },
      select: { id: true, code: true },
    });
    for (const e of existing) codeToId.set(normalizeAccountCode(e.code), e.id);

    for (const row of parsed) {
      const parentId = row.parentCode ? codeToId.get(normalizeAccountCode(row.parentCode)) : null;
      if (row.parentCode && !parentId) {
        throw new BadRequestException(`Parent code ${row.parentCode} not found for ${row.code}`);
      }
      assertCodeInTypeRange(row.code, row.type);
      const existingId = codeToId.get(row.code);
      if (existingId) {
        await this.updateAccount(existingId, tenantId, {
          name: row.name,
          type: row.type,
          description: row.description,
          parentId: parentId ?? null,
          openingBalance: row.openingBalance,
          isActive: true,
        });
        updated += 1;
      } else {
        const acct = await this.createAccount(tenantId, 'import', {
          code: row.code,
          name: row.name,
          type: row.type,
          description: row.description,
          parentId: parentId ?? undefined,
          openingBalance: row.openingBalance,
        });
        codeToId.set(row.code, acct.id);
        created += 1;
      }
    }
    return { created, updated, total: parsed.length };
  }

  async createExpense(tenantId: string, branchId: string, userId: string, dto: CreateExpenseDto) {
    const method = dto.paymentMethod ?? PaymentMethod.CASH;
    const chequeNumber = (dto.chequeNumber || dto.reference || '').trim();
    if (method === PaymentMethod.CHEQUE && !chequeNumber) {
      throw new BadRequestException('Cheque number is required for cheque expenses');
    }

    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          tenantId, branchId,
          amount: dto.amount,
          description: dto.description,
          date: new Date(dto.date),
          categoryId: normalizeExpenseCategory(dto.categoryId),
          paymentMethod: method,
          reference: dto.reference || chequeNumber || undefined,
          createdBy: userId,
        },
      });

      if (method === PaymentMethod.CHEQUE) {
        await tx.cheque.create({
          data: {
            tenantId,
            direction: ChequeDirection.ISSUED,
            status: ChequeStatus.ISSUED,
            chequeNumber,
            amount: dto.amount,
            bankName: dto.chequeBankName?.trim() || undefined,
            dueDate: dto.chequeDueDate ? new Date(dto.chequeDueDate) : undefined,
            partyType: 'EXPENSE',
            partyName: dto.description,
            bankAccountId: dto.chequeBankAccountId || undefined,
            notes: chequeSourceNotes('Expense', expense.id, dto.description),
            createdBy: userId,
          },
        });
      }

      return expense;
    }).then((expense) => {
      this.eventEmitter.emit('accounting.expense.created', {
        expenseId: expense.id,
        tenantId,
        userId,
      });
      return expense;
    });
  }

  async getExpenses(tenantId: string, query: PaginationDto & { startDate?: string; endDate?: string }) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const where = {
      tenantId,
      ...(query.startDate && query.endDate && {
        date: {
          gte: dayjs(query.startDate).startOf('day').toDate(),
          lte: dayjs(query.endDate).endOf('day').toDate(),
        },
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.expense.findMany({ where, skip, take, orderBy: { date: 'desc' } }),
      this.prisma.expense.count({ where }),
    ]);
    return paginate(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async getProfitLoss(tenantId: string, startDate: string, endDate: string) {
    return this.finance.getEnhancedProfitLoss(tenantId, startDate, endDate);
  }

  async getTrialBalance(tenantId: string) {
    return this.prisma.account.findMany({
      where: { tenantId, isActive: true },
      select: { code: true, name: true, type: true, balance: true },
      orderBy: { code: 'asc' },
    });
  }

  async updateExpense(id: string, tenantId: string, dto: UpdateExpenseDto) {
    const expense = await this.prisma.expense.findFirst({ where: { id, tenantId } });
    if (!expense) throw new NotFoundException('Expense not found');
    return this.prisma.expense.update({
      where: { id },
      data: {
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.description && { description: dto.description }),
        ...(dto.date && { date: new Date(dto.date) }),
        ...(dto.categoryId !== undefined && { categoryId: normalizeExpenseCategory(dto.categoryId) }),
        ...(dto.paymentMethod && { paymentMethod: dto.paymentMethod }),
        ...(dto.reference !== undefined && { reference: dto.reference }),
      },
    });
  }

  async deleteExpense(id: string, tenantId: string) {
    const expense = await this.prisma.expense.findFirst({ where: { id, tenantId } });
    if (!expense) throw new NotFoundException('Expense not found');
    return this.prisma.expense.delete({ where: { id } });
  }

  async getExpenseSummary(tenantId: string, startDate: string, endDate: string) {
    const dateRange = {
      gte: dayjs(startDate).startOf('day').toDate(),
      lte: dayjs(endDate).endOf('day').toDate(),
    };
    const expenses = await this.prisma.expense.findMany({
      where: { tenantId, date: dateRange },
      select: { categoryId: true, amount: true, paymentMethod: true },
    });
    const byCategory: Record<string, number> = {};
    const byMethod: Record<string, number> = {};
    let total = 0;
    for (const e of expenses) {
      const cat = normalizeExpenseCategory(e.categoryId);
      byCategory[cat] = (byCategory[cat] ?? 0) + e.amount;
      byMethod[e.paymentMethod] = (byMethod[e.paymentMethod] ?? 0) + e.amount;
      total += e.amount;
    }
    return {
      total,
      byCategory: Object.entries(byCategory).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount),
      byPaymentMethod: Object.entries(byMethod).map(([method, amount]) => ({ method, amount })),
    };
  }

  async getMonthlyPL(tenantId: string, months = 6) {
    const result = [];
    for (let i = months - 1; i >= 0; i--) {
      const start = dayjs().subtract(i, 'month').startOf('month').toDate();
      const end   = dayjs().subtract(i, 'month').endOf('month').toDate();
      const label = dayjs().subtract(i, 'month').format('MMM YY');
      const [rev, exp, ret] = await this.prisma.$transaction([
        this.prisma.sale.aggregate({ where: { tenantId, invoiceDate: { gte: start, lte: end }, status: { not: 'CANCELLED' } }, _sum: { total: true } }),
        this.prisma.expense.aggregate({ where: { tenantId, date: { gte: start, lte: end } }, _sum: { amount: true } }),
        this.prisma.return.aggregate({
          where: {
            tenantId,
            createdAt: { gte: start, lte: end },
            status: { in: [...AccountingService.SETTLED_RETURN_STATUSES] },
          },
          _sum: { refundAmount: true },
        }),
      ]);
      const revenue  = (rev._sum?.total ?? 0) - (ret._sum?.refundAmount ?? 0);
      const expenses = exp._sum?.amount ?? 0;
      result.push({ month: label, revenue, expenses, profit: revenue - expenses });
    }
    return result;
  }

  async getCashFlow(tenantId: string, startDate: string, endDate: string) {
    const dateRange = { gte: dayjs(startDate).startOf('day').toDate(), lte: dayjs(endDate).endOf('day').toDate() };
    const [payments, creditPayments, expenses, supplierPayments, refunds] = await Promise.all([
      this.prisma.salePayment.findMany({
        where: {
          sale: { tenantId, invoiceDate: dateRange, status: { not: 'CANCELLED' } },
          method: { not: PaymentMethod.CUSTOMER_CREDIT },
        },
        select: { amount: true, sale: { select: { invoiceDate: true } } },
      }),
      this.prisma.customerCreditTransaction.findMany({
        where: {
          tenantId,
          type: 'PAYMENT',
          createdAt: dateRange,
        },
        select: { amount: true, createdAt: true },
      }),
      this.prisma.expense.findMany({ where: { tenantId, date: dateRange }, select: { amount: true, date: true } }),
      this.prisma.supplierPayment.findMany({
        where: { tenantId, paidAt: dateRange },
        select: { amount: true, paidAt: true, method: true },
      }),
      this.prisma.return.findMany({
        where: {
          tenantId,
          createdAt: dateRange,
          status: { in: [...AccountingService.SETTLED_RETURN_STATUSES] },
        },
        select: { refundAmount: true, createdAt: true },
      }),
    ]);
    const map: Record<string, { date: string; inflow: number; outflow: number }> = {};
    const bump = (key: string, field: 'inflow' | 'outflow', amt: number) => {
      if (!map[key]) map[key] = { date: key, inflow: 0, outflow: 0 };
      map[key][field] += amt;
    };
    for (const p of payments) {
      bump(dayjs(p.sale.invoiceDate).format('YYYY-MM-DD'), 'inflow', p.amount);
    }
    for (const cp of creditPayments) {
      bump(dayjs(cp.createdAt).format('YYYY-MM-DD'), 'inflow', cp.amount);
    }
    for (const e of expenses) {
      bump(dayjs(e.date).format('YYYY-MM-DD'), 'outflow', e.amount);
    }
    for (const p of supplierPayments) {
      bump(dayjs(p.paidAt).format('YYYY-MM-DD'), 'outflow', p.amount);
    }
    for (const r of refunds) {
      bump(dayjs(r.createdAt).format('YYYY-MM-DD'), 'outflow', r.refundAmount);
    }
    const data = Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
    const totalInflow = payments.reduce((s, p) => s + p.amount, 0)
      + creditPayments.reduce((s, c) => s + c.amount, 0);
    const totalOutflow = expenses.reduce((s, e) => s + e.amount, 0)
      + supplierPayments.reduce((s, p) => s + p.amount, 0)
      + refunds.reduce((s, r) => s + r.refundAmount, 0);
    return {
      data,
      totalInflow,
      totalOutflow,
      outflowBreakdown: {
        expenses: expenses.reduce((s, e) => s + e.amount, 0),
        supplierPayments: supplierPayments.reduce((s, p) => s + p.amount, 0),
        cashSupplierPayments: supplierPayments
          .filter((p) => p.method === PaymentMethod.CASH)
          .reduce((s, p) => s + p.amount, 0),
        refunds: refunds.reduce((s, r) => s + r.refundAmount, 0),
      },
    };
  }

  async getBalanceSheet(tenantId: string) {
    const [salesAgg, expAgg, refundAgg, accounts, arAgg, purchaseOrders] = await this.prisma.$transaction([
      this.prisma.sale.aggregate({ where: { tenantId, status: { not: 'CANCELLED' } }, _sum: { total: true } }),
      this.prisma.expense.aggregate({ where: { tenantId }, _sum: { amount: true } }),
      this.prisma.return.aggregate({
        where: { tenantId, status: { in: [...AccountingService.SETTLED_RETURN_STATUSES] } },
        _sum: { refundAmount: true },
      }),
      this.prisma.account.findMany({ where: { tenantId, isActive: true }, select: { id: true, code: true, name: true, type: true, balance: true } }),
      this.prisma.customer.aggregate({ where: { tenantId, creditBalance: { gt: 0 } }, _sum: { creditBalance: true } }),
      this.prisma.purchaseOrder.findMany({
        where: { tenantId, status: { in: ['RECEIVED', 'PARTIALLY_RECEIVED', 'CONFIRMED', 'SENT'] } },
        select: { total: true, paidAmount: true },
      }),
    ]);
    const netSales = (salesAgg._sum?.total ?? 0) - (refundAgg._sum?.refundAmount ?? 0);
    const expenses = expAgg._sum?.amount ?? 0;
    const retained = netSales - expenses;
    const accountsReceivable = arAgg._sum?.creditBalance ?? 0;
    const accountsPayable = purchaseOrders.reduce(
      (s, po) => s + Math.max(0, po.total - po.paidAmount),
      0,
    );
    const byType = (t: AccountType) => accounts.filter((a) => a.type === t);
    const assetTotal = byType(AccountType.ASSET).reduce((s, a) => s + a.balance, 0);
    const liabilityTotal = byType(AccountType.LIABILITY).reduce((s, a) => s + a.balance, 0) + accountsPayable;
    const equityTotal = byType(AccountType.EQUITY).reduce((s, a) => s + a.balance, 0) + retained;
    return {
      assets: {
        accounts: byType(AccountType.ASSET),
        accountsReceivable,
        total: assetTotal + accountsReceivable,
      },
      liabilities: {
        accounts: byType(AccountType.LIABILITY),
        accountsPayable,
        total: liabilityTotal,
      },
      equity: {
        accounts: byType(AccountType.EQUITY),
        retainedEarnings: retained,
        total: equityTotal,
      },
      revenue: { accounts: byType(AccountType.REVENUE), total: byType(AccountType.REVENUE).reduce((s, a) => s + a.balance, 0) },
      expenseAcct: { accounts: byType(AccountType.EXPENSE), total: byType(AccountType.EXPENSE).reduce((s, a) => s + a.balance, 0) },
    };
  }

  async getJournalEntries(
    tenantId: string,
    query: PaginationDto & {
      status?: JournalEntryStatus;
      q?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    return this.journals.list(tenantId, query);
  }

  async getJournalEntry(tenantId: string, id: string) {
    return this.journals.getOne(tenantId, id);
  }

  async createJournalEntry(
    tenantId: string,
    branchId: string,
    userId: string,
    roles: string[],
    dto: CreateJournalEntryDto,
  ) {
    return this.journals.create(tenantId, branchId, userId, roles, dto);
  }

  async updateJournalEntry(tenantId: string, userId: string, id: string, dto: UpdateJournalEntryDto) {
    return this.journals.update(tenantId, userId, id, dto);
  }

  async submitJournalEntry(tenantId: string, userId: string, roles: string[], id: string) {
    return this.journals.submit(tenantId, userId, roles, id);
  }

  async approveJournalEntry(tenantId: string, userId: string, id: string) {
    return this.journals.approve(tenantId, userId, id);
  }

  async rejectJournalEntry(tenantId: string, userId: string, id: string, reason?: string) {
    return this.journals.reject(tenantId, userId, id, reason);
  }

  async postJournalEntry(tenantId: string, userId: string, roles: string[], id: string) {
    return this.journals.post(tenantId, userId, roles, id);
  }

  async voidJournalEntry(tenantId: string, userId: string, id: string, reason?: string) {
    return this.journals.void(tenantId, userId, id, reason);
  }

  async getAccountsReceivable(tenantId: string, asOfDate?: string) {
    const aging = await this.finance.getAccountsReceivableAging(tenantId, asOfDate);
    return {
      total: aging.total,
      count: aging.customers.length,
      asOf: aging.asOf,
      buckets: aging.buckets,
      customers: aging.customers.map((c) => ({
        id: c.id,
        code: c.code,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        creditBalance: c.creditBalance,
        creditLimit: c.creditLimit,
        bucket: c.bucket,
        daysPastDue: c.daysPastDue,
      })),
    };
  }

  async getAccountsPayable(tenantId: string, asOfDate?: string) {
    const aging = await this.finance.getAccountsPayableAging(tenantId, asOfDate);
    const purchaseOrders = await this.prisma.purchaseOrder.findMany({
      where: { tenantId, status: { in: ['RECEIVED', 'PARTIALLY_RECEIVED', 'CONFIRMED', 'SENT'] } },
      select: {
        id: true, poNumber: true, total: true, paidAmount: true, orderDate: true,
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { orderDate: 'desc' },
    });
    const unpaidPos = purchaseOrders
      .map((po) => ({ ...po, balanceDue: Math.max(0, po.total - po.paidAmount) }))
      .filter((po) => po.balanceDue > 0.01);
    const byParty = new Map<string, { id: string; name: string; balance: number }>();
    for (const line of aging.lines) {
      const key = line.partyName;
      const cur = byParty.get(key) ?? { id: line.id, name: line.partyName, balance: 0 };
      cur.balance += line.amount;
      byParty.set(key, cur);
    }
    return {
      total: aging.total,
      supplierBalanceTotal: aging.supplierBalanceTotal,
      purchaseOrderDueTotal: aging.purchaseOrderDueTotal,
      invoiceDueTotal: aging.invoiceDueTotal,
      asOf: aging.asOf,
      buckets: aging.buckets,
      agingLines: aging.lines,
      suppliers: [...byParty.values()].sort((a, b) => b.balance - a.balance),
      unpaidPurchaseOrders: unpaidPos,
    };
  }
}

@ApiTags('Accounting')
@ApiBearerAuth('access-token')
@Controller({ path: 'accounting', version: '1' })
export class AccountingController {
  constructor(
    private readonly accountingService: AccountingService,
    private readonly financeService: FinanceService,
    private readonly periodsService: FinancialPeriodsService,
    private readonly taxService: TaxService,
    private readonly pettyCashService: PettyCashService,
    private readonly fixedAssetsService: FixedAssetsService,
    private readonly payrollService: PayrollService,
    private readonly financialReportsService: FinancialReportsService,
    private readonly settingsService: AccountingSettingsService,
    private readonly bootstrapService: AccountingBootstrapService,
    private readonly postingService: AccountingPostingService,
    private readonly outboxService: AccountingOutboxService,
  ) {}

  @Post('bootstrap')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Auto-create COA, fiscal year, cash accounts, tax rates, and GL mappings' })
  bootstrapAccounting(@CurrentUser() user: IAuthUser) {
    return this.bootstrapService.bootstrapTenant(user.tenantId, user.id);
  }

  @Post('backfill')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Post missing GL journals for past sales, GRNs, expenses, and AP payments' })
  backfillAccounting(@CurrentUser() user: IAuthUser, @Query('limit') limit?: string) {
    const n = Math.min(500, Math.max(1, Number(limit) || 200));
    return this.postingService.backfillTenant(user.tenantId, n);
  }

  @Get('sync/events')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'List accounting outbox events' })
  listSyncEvents(
    @CurrentUser() user: IAuthUser,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.outboxService.list(user.tenantId, {
      status: status as any,
      limit: Number(limit) || 50,
    });
  }

  @Post('sync/scan')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Scan missing source transactions and enqueue outbox events' })
  scanSync(@CurrentUser() user: IAuthUser, @Query('limit') limit?: string) {
    return this.outboxService.scanMissing(user.tenantId, Number(limit) || 100);
  }

  @Post('sync/process')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Process pending/failed accounting outbox events' })
  processSync(@CurrentUser() user: IAuthUser, @Query('limit') limit?: string) {
    return this.outboxService.processPending(user.tenantId, Number(limit) || 50);
  }

  @Post('sync/retry/:id')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Retry a failed outbox event' })
  retrySync(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.outboxService.retry(user.tenantId, id);
  }

  @Get('sync/verify')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Tenant accounting readiness checklist' })
  verifyAccounting(@CurrentUser() user: IAuthUser) {
    return this.outboxService.verifyChecklist(user.tenantId);
  }

  @Get('settings/mappings')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'List GL account mappings' })
  listMappings(@CurrentUser() user: IAuthUser) {
    return this.settingsService.listAccountMappings(user.tenantId);
  }

  @Put('settings/mappings')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Bulk upsert GL account mappings' })
  upsertMappings(@CurrentUser() user: IAuthUser, @Body() dto: BulkAccountMappingsDto) {
    return this.settingsService.bulkUpsertAccountMappings(user.tenantId, dto.mappings ?? []);
  }

  @Post('settings/mappings/seed')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Seed missing default GL account mappings' })
  seedMappings(@CurrentUser() user: IAuthUser) {
    return this.bootstrapService.ensureMappings(user.tenantId);
  }

  @Get('accounts')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Get chart of accounts (tree)' })
  getAccounts(
    @CurrentUser() user: IAuthUser,
    @Query('type') type?: AccountType,
    @Query('q') q?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('flat') flat?: string,
  ) {
    return this.accountingService.getAccounts(user.tenantId, {
      type,
      q,
      includeInactive: includeInactive === 'true' || includeInactive === '1',
      flat: flat === 'true' || flat === '1',
    });
  }

  @Get('accounts/next-code')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Suggest next account code for type / parent' })
  getNextAccountCode(
    @CurrentUser() user: IAuthUser,
    @Query('type') type: AccountType,
    @Query('parentId') parentId?: string,
  ) {
    return this.accountingService.getNextAccountCode(user.tenantId, type, parentId);
  }

  @Get('accounts/export')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Export chart of accounts' })
  exportAccounts(@CurrentUser() user: IAuthUser) {
    return this.accountingService.exportAccounts(user.tenantId);
  }

  @Post('accounts/import')
  @RequirePermissions('accounting:create')
  @ApiOperation({ summary: 'Import chart of accounts rows' })
  importAccounts(@CurrentUser() user: IAuthUser, @Body() body: ImportAccountsDto) {
    return this.accountingService.importAccounts(user.tenantId, body.rows ?? []);
  }

  @Post('accounts/seed-defaults')
  @RequirePermissions('accounting:create')
  @ApiOperation({ summary: 'Seed default starter chart of accounts' })
  seedDefaults(@CurrentUser() user: IAuthUser) {
    return this.accountingService.seedDefaultCoa(user.tenantId);
  }

  @Post('accounts')
  @RequirePermissions('accounting:create')
  @ApiOperation({ summary: 'Create account' })
  createAccount(@CurrentUser() user: IAuthUser, @Body() dto: CreateAccountDto) {
    return this.accountingService.createAccount(user.tenantId, user.id, dto);
  }

  @Put('accounts/:id')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Update account' })
  updateAccount(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return this.accountingService.updateAccount(id, user.tenantId, dto);
  }

  @Delete('accounts/:id')
  @RequirePermissions('accounting:delete')
  @ApiOperation({ summary: 'Deactivate account' })
  deleteAccount(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.accountingService.deleteAccount(id, user.tenantId);
  }

  @Post('expenses')
  @RequirePermissions('accounting:create')
  @ApiOperation({ summary: 'Record expense' })
  createExpense(@CurrentUser() user: IAuthUser, @Body() dto: CreateExpenseDto) {
    return this.accountingService.createExpense(user.tenantId, user.branchId ?? '', user.id, dto);
  }

  @Get('expenses')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'List expenses' })
  getExpenses(@CurrentUser() user: IAuthUser, @Query() query: PaginationDto & { startDate?: string; endDate?: string }) {
    return this.accountingService.getExpenses(user.tenantId, query);
  }

  @Get('profit-loss')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Get P&L report' })
  getProfitLoss(@CurrentUser() user: IAuthUser, @Query('startDate') start: string, @Query('endDate') end: string) {
    return this.accountingService.getProfitLoss(user.tenantId, start, end);
  }

  @Put('expenses/:id')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Update expense' })
  updateExpense(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: UpdateExpenseDto) {
    return this.accountingService.updateExpense(id, user.tenantId, dto);
  }

  @Delete('expenses/:id')
  @RequirePermissions('accounting:delete')
  @ApiOperation({ summary: 'Delete expense' })
  deleteExpense(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.accountingService.deleteExpense(id, user.tenantId);
  }

  @Get('expenses/summary')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Expense summary by category' })
  getExpenseSummary(@CurrentUser() user: IAuthUser, @Query('startDate') start: string, @Query('endDate') end: string) {
    return this.accountingService.getExpenseSummary(user.tenantId, start ?? dayjs().startOf('month').format('YYYY-MM-DD'), end ?? dayjs().endOf('month').format('YYYY-MM-DD'));
  }

  @Get('monthly-pl')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Monthly P&L for last N months' })
  getMonthlyPL(@CurrentUser() user: IAuthUser, @Query('months') months: string) {
    return this.accountingService.getMonthlyPL(user.tenantId, months ? parseInt(months) : 6);
  }

  @Get('cash-flow')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Cash flow for date range' })
  getCashFlow(@CurrentUser() user: IAuthUser, @Query('startDate') start: string, @Query('endDate') end: string) {
    return this.accountingService.getCashFlow(user.tenantId, start ?? dayjs().subtract(30, 'day').format('YYYY-MM-DD'), end ?? dayjs().format('YYYY-MM-DD'));
  }

  @Get('balance-sheet')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Balance sheet' })
  getBalanceSheet(@CurrentUser() user: IAuthUser) {
    return this.accountingService.getBalanceSheet(user.tenantId);
  }

  @Get('journal-entries')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'List journal entries' })
  getJournalEntries(
    @CurrentUser() user: IAuthUser,
    @Query() query: PaginationDto,
    @Query('status') status?: JournalEntryStatus,
    @Query('q') q?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.accountingService.getJournalEntries(user.tenantId, {
      ...query,
      status,
      q,
      startDate,
      endDate,
    });
  }

  @Get('journal-entries/:id')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Get journal entry' })
  getJournalEntry(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.accountingService.getJournalEntry(user.tenantId, id);
  }

  @Post('journal-entries')
  @RequirePermissions('accounting:create')
  @ApiOperation({ summary: 'Create journal entry (draft / submit / post)' })
  createJournalEntry(@CurrentUser() user: IAuthUser, @Body() dto: CreateJournalEntryDto) {
    return this.accountingService.createJournalEntry(
      user.tenantId,
      user.branchId ?? '',
      user.id,
      user.roles ?? [],
      dto,
    );
  }

  @Put('journal-entries/:id')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Update draft journal entry' })
  updateJournalEntry(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateJournalEntryDto,
  ) {
    return this.accountingService.updateJournalEntry(user.tenantId, user.id, id, dto);
  }

  @Post('journal-entries/:id/submit')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Submit journal for approval' })
  submitJournal(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.accountingService.submitJournalEntry(
      user.tenantId,
      user.id,
      user.roles ?? [],
      id,
    );
  }

  @Post('journal-entries/:id/approve')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Approve pending journal' })
  approveJournal(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.accountingService.approveJournalEntry(user.tenantId, user.id, id);
  }

  @Post('journal-entries/:id/reject')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Reject pending journal (back to draft)' })
  rejectJournal(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() dto: RejectJournalDto,
  ) {
    return this.accountingService.rejectJournalEntry(user.tenantId, user.id, id, dto.reason);
  }

  @Post('journal-entries/:id/post')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Post approved/draft journal to GL' })
  postJournal(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.accountingService.postJournalEntry(
      user.tenantId,
      user.id,
      user.roles ?? [],
      id,
    );
  }

  @Post('journal-entries/:id/void')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Void journal (reverses balances if posted)' })
  voidJournal(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() dto: VoidJournalDto,
  ) {
    return this.accountingService.voidJournalEntry(user.tenantId, user.id, id, dto.reason);
  }

  @Get('accounts-receivable')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Customer credit outstanding (AR) with aging' })
  getAccountsReceivable(@CurrentUser() user: IAuthUser, @Query('asOfDate') asOfDate?: string) {
    return this.accountingService.getAccountsReceivable(user.tenantId, asOfDate);
  }

  @Get('accounts-payable')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Supplier balances, invoices, unpaid POs (AP) with aging' })
  getAccountsPayable(@CurrentUser() user: IAuthUser, @Query('asOfDate') asOfDate?: string) {
    return this.accountingService.getAccountsPayable(user.tenantId, asOfDate);
  }

  @Get('trial-balance')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Get trial balance' })
  getTrialBalance(@CurrentUser() user: IAuthUser) {
    return this.accountingService.getTrialBalance(user.tenantId);
  }

  // ── Phase 5 / Sprint 4 Finance — Cash & Bank ───────────────────────

  @Get('cash-book')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Cash book for date range' })
  getCashBook(
    @CurrentUser() user: IAuthUser,
    @Query('startDate') start: string,
    @Query('endDate') end: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.financeService.getCashBook(
      user.tenantId,
      branchId ?? user.branchId ?? '',
      start ?? dayjs().startOf('month').format('YYYY-MM-DD'),
      end ?? dayjs().format('YYYY-MM-DD'),
    );
  }

  @Post('cash-book')
  @RequirePermissions('accounting:create')
  @ApiOperation({ summary: 'Append cash book entry' })
  appendCashBook(@CurrentUser() user: IAuthUser, @Body() dto: CashBookEntryDto) {
    return this.financeService.appendCashBookEntry(user.tenantId, user.branchId ?? '', user.id, dto);
  }

  @Get('bank-accounts')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'List bank accounts' })
  listBankAccounts(
    @CurrentUser() user: IAuthUser,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.financeService.listBankAccounts(
      user.tenantId,
      includeInactive === 'true' || includeInactive === '1',
    );
  }

  @Post('bank-accounts')
  @RequirePermissions('accounting:create')
  @ApiOperation({ summary: 'Create bank account' })
  createBankAccount(@CurrentUser() user: IAuthUser, @Body() dto: CreateBankAccountDto) {
    return this.financeService.createBankAccount(user.tenantId, user.branchId ?? '', dto);
  }

  @Put('bank-accounts/:id')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Update bank account' })
  updateBankAccount(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateBankAccountDto,
  ) {
    return this.financeService.updateBankAccount(user.tenantId, id, dto);
  }

  @Get('bank-accounts/:id/book')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Bank book (running balance) for date range' })
  getBankBook(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Query('startDate') start: string,
    @Query('endDate') end: string,
  ) {
    return this.financeService.getBankBook(
      user.tenantId,
      id,
      start ?? dayjs().startOf('month').format('YYYY-MM-DD'),
      end ?? dayjs().format('YYYY-MM-DD'),
    );
  }

  @Post('bank-transactions')
  @RequirePermissions('accounting:create')
  @ApiOperation({ summary: 'Post bank transaction (deposit/withdrawal/fee/…)' })
  postBankTxn(@CurrentUser() user: IAuthUser, @Body() dto: CreateBankTxnDto) {
    return this.financeService.postBankTransaction(
      user.tenantId,
      user.id,
      user.branchId ?? '',
      dto,
    );
  }

  @Post('bank-transfers')
  @RequirePermissions('accounting:create')
  @ApiOperation({ summary: 'Transfer between bank / cash accounts' })
  bankTransfer(@CurrentUser() user: IAuthUser, @Body() dto: BankTransferDto) {
    return this.financeService.transferBetweenAccounts(
      user.tenantId,
      user.id,
      user.branchId ?? '',
      dto,
    );
  }

  @Get('bank-accounts/:id/transactions')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'List bank account transactions' })
  listBankTxns(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Query() query: PaginationDto) {
    return this.financeService.listBankTransactions(user.tenantId, id, query);
  }

  @Get('bank-accounts/:id/unreconciled')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'List unreconciled bank transactions' })
  listUnreconciled(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Query('asOfDate') asOfDate?: string,
  ) {
    return this.financeService.listUnreconciledTransactions(user.tenantId, id, asOfDate);
  }

  @Get('cheques/dashboard')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Cheque management KPIs' })
  chequeDashboard(@CurrentUser() user: IAuthUser) {
    return this.financeService.getChequeDashboard(user.tenantId);
  }

  @Get('cheques')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'List cheques' })
  listCheques(
    @CurrentUser() user: IAuthUser,
    @Query() query: PaginationDto & { status?: ChequeStatus; direction?: ChequeDirection; search?: string },
  ) {
    return this.financeService.listCheques(user.tenantId, query);
  }

  @Post('cheques')
  @RequirePermissions('accounting:create')
  @ApiOperation({ summary: 'Register cheque' })
  createCheque(@CurrentUser() user: IAuthUser, @Body() dto: CreateChequeDto) {
    return this.financeService.createCheque(user.tenantId, user.id, dto);
  }

  @Put('cheques/:id/status')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Update cheque status (deposit/clear/bounce/cancel)' })
  updateChequeStatus(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: UpdateChequeStatusDto) {
    return this.financeService.updateChequeStatus(
      id,
      user.tenantId,
      user.id,
      user.branchId ?? '',
      dto.status,
      dto.bankAccountId,
    );
  }

  @Get('bank-reconciliations')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'List bank reconciliations' })
  listRecons(@CurrentUser() user: IAuthUser, @Query('bankAccountId') bankAccountId?: string) {
    return this.financeService.listReconciliations(user.tenantId, bankAccountId);
  }

  @Get('bank-reconciliations/:id')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Get reconciliation with unmatched transactions' })
  getRecon(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.financeService.getReconciliation(user.tenantId, id);
  }

  @Post('bank-reconciliations')
  @RequirePermissions('accounting:create')
  @ApiOperation({ summary: 'Start bank reconciliation' })
  startRecon(@CurrentUser() user: IAuthUser, @Body() dto: StartReconciliationDto) {
    return this.financeService.startReconciliation(user.tenantId, user.id, dto);
  }

  @Post('bank-reconciliations/:id/complete')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Complete bank reconciliation' })
  completeRecon(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: CompleteReconciliationDto) {
    return this.financeService.completeReconciliation(id, user.tenantId, dto.matchedTxnIds ?? []);
  }

  @Post('bank-reconciliations/:id/cancel')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Cancel draft bank reconciliation' })
  cancelRecon(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.financeService.cancelReconciliation(id, user.tenantId);
  }

  // ── Sprint 7 VAT & Tax ─────────────────────────────────────────────

  @Get('tax-rates')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'List tax rates' })
  listTaxRates(
    @CurrentUser() user: IAuthUser,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.taxService.listTaxRates(
      user.tenantId,
      includeInactive === 'true' || includeInactive === '1',
    );
  }

  @Post('tax-rates')
  @RequirePermissions('accounting:create')
  @ApiOperation({ summary: 'Create tax rate' })
  createTaxRate(@CurrentUser() user: IAuthUser, @Body() dto: CreateTaxRateDto) {
    return this.taxService.createTaxRate(user.tenantId, dto);
  }

  @Put('tax-rates/:id')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Update tax rate' })
  updateTaxRate(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTaxRateDto,
  ) {
    return this.taxService.updateTaxRate(id, user.tenantId, dto);
  }

  @Post('tax-rates/seed-defaults')
  @RequirePermissions('accounting:create')
  @ApiOperation({ summary: 'Seed default VAT rates' })
  seedTaxRates(@CurrentUser() user: IAuthUser) {
    return this.taxService.seedDefaultTaxRates(user.tenantId);
  }

  @Post('tax/preview')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Preview line tax calculation' })
  taxPreview(@Body() dto: TaxPreviewDto) {
    return this.taxService.calculatePreview(dto.amount, dto.rate, dto.inclusive);
  }

  @Get('vat/report')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'VAT report for period (output + input + net)' })
  vatReport(
    @CurrentUser() user: IAuthUser,
    @Query('startDate') start: string,
    @Query('endDate') end: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.taxService.getVatReport(
      user.tenantId,
      start ?? dayjs().startOf('month').format('YYYY-MM-DD'),
      end ?? dayjs().format('YYYY-MM-DD'),
      branchId,
    );
  }

  @Get('vat/returns')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'List VAT returns' })
  listVatReturns(@CurrentUser() user: IAuthUser) {
    return this.taxService.listVatReturns(user.tenantId);
  }

  @Get('vat/returns/:id')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Get VAT return' })
  getVatReturn(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.taxService.getVatReturn(id, user.tenantId);
  }

  @Post('vat/returns')
  @RequirePermissions('accounting:create')
  @ApiOperation({ summary: 'Create draft VAT return from period activity' })
  createVatReturn(@CurrentUser() user: IAuthUser, @Body() dto: CreateVatReturnDto) {
    return this.taxService.createVatReturn(user.tenantId, user.id, {
      ...dto,
      branchId: dto.branchId ?? user.branchId ?? undefined,
    });
  }

  @Post('vat/returns/:id/refresh')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Recalculate draft VAT return totals' })
  refreshVatReturn(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.taxService.refreshVatReturn(id, user.tenantId);
  }

  @Post('vat/returns/:id/submit')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Submit VAT return for filing' })
  submitVatReturn(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.taxService.submitVatReturn(id, user.tenantId);
  }

  @Post('vat/returns/:id/file')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'File VAT return (optional settlement journal)' })
  fileVatReturn(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() dto: FileVatReturnDto,
  ) {
    return this.taxService.fileVatReturn(
      id,
      user.tenantId,
      user.id,
      user.branchId ?? '',
      { postJournal: dto.postJournal },
    );
  }

  @Post('vat/returns/:id/cancel')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Cancel draft/submitted VAT return' })
  cancelVatReturn(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.taxService.cancelVatReturn(id, user.tenantId);
  }

  // ── Sprint 8 Petty Cash ────────────────────────────────────────────

  @Get('petty-cash/funds')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'List petty cash funds' })
  listPettyFunds(
    @CurrentUser() user: IAuthUser,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.pettyCashService.listFunds(
      user.tenantId,
      includeInactive === 'true' || includeInactive === '1',
    );
  }

  @Post('petty-cash/funds')
  @RequirePermissions('accounting:create')
  @ApiOperation({ summary: 'Create petty cash fund (links BankAccount PETTY_CASH)' })
  createPettyFund(@CurrentUser() user: IAuthUser, @Body() dto: CreatePettyFundDto) {
    return this.pettyCashService.createFund(
      user.tenantId,
      user.branchId ?? undefined,
      user.id,
      dto,
    );
  }

  @Put('petty-cash/funds/:id')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Update petty cash fund' })
  updatePettyFund(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePettyFundDto,
  ) {
    return this.pettyCashService.updateFund(id, user.tenantId, dto);
  }

  @Get('petty-cash/book')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Petty cash book for a fund' })
  pettyCashBook(
    @CurrentUser() user: IAuthUser,
    @Query('fundId') fundId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    if (!fundId) throw new BadRequestException('fundId required');
    return this.pettyCashService.getBook(user.tenantId, fundId, startDate, endDate);
  }

  @Get('petty-cash/transactions')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'List petty cash transactions' })
  listPettyTxns(
    @CurrentUser() user: IAuthUser,
    @Query('fundId') fundId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.pettyCashService.listTransactions(user.tenantId, {
      fundId,
      startDate,
      endDate,
    });
  }

  @Post('petty-cash/disbursements')
  @RequirePermissions('accounting:create')
  @ApiOperation({ summary: 'Record petty cash disbursement (expense)' })
  pettyDisbursement(@CurrentUser() user: IAuthUser, @Body() dto: PettyDisbursementDto) {
    return this.pettyCashService.recordDisbursement(
      user.tenantId,
      user.branchId ?? undefined,
      user.id,
      dto,
    );
  }

  @Post('petty-cash/replenish')
  @RequirePermissions('accounting:create')
  @ApiOperation({ summary: 'Replenish petty cash toward float' })
  pettyReplenish(@CurrentUser() user: IAuthUser, @Body() dto: PettyReplenishDto) {
    return this.pettyCashService.replenish(
      user.tenantId,
      user.branchId ?? undefined,
      user.id,
      dto,
    );
  }

  @Get('petty-cash/report')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Petty cash & claims report for period' })
  pettyCashReport(
    @CurrentUser() user: IAuthUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('fundId') fundId?: string,
  ) {
    return this.pettyCashService.getReport(user.tenantId, startDate, endDate, fundId);
  }

  @Get('expense-claims')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'List expense claims' })
  listExpenseClaims(
    @CurrentUser() user: IAuthUser,
    @Query('status') status?: ExpenseClaimStatus,
  ) {
    return this.pettyCashService.listClaims(user.tenantId, status);
  }

  @Get('expense-claims/:id')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Get expense claim' })
  getExpenseClaim(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.pettyCashService.getClaim(id, user.tenantId);
  }

  @Post('expense-claims')
  @RequirePermissions('accounting:create')
  @ApiOperation({ summary: 'Create expense claim' })
  createExpenseClaim(@CurrentUser() user: IAuthUser, @Body() dto: CreateExpenseClaimDto) {
    return this.pettyCashService.createClaim(
      user.tenantId,
      user.branchId ?? undefined,
      user.id,
      dto,
    );
  }

  @Post('expense-claims/:id/submit')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Submit expense claim' })
  submitExpenseClaim(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.pettyCashService.submitClaim(id, user.tenantId);
  }

  @Post('expense-claims/:id/approve')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Approve expense claim' })
  approveExpenseClaim(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.pettyCashService.approveClaim(id, user.tenantId, user.id);
  }

  @Post('expense-claims/:id/reject')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Reject expense claim' })
  rejectExpenseClaim(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() dto: RejectClaimDto,
  ) {
    return this.pettyCashService.rejectClaim(id, user.tenantId, dto.reason);
  }

  @Post('expense-claims/:id/cancel')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Cancel expense claim' })
  cancelExpenseClaim(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.pettyCashService.cancelClaim(id, user.tenantId);
  }

  @Get('reimbursements')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'List reimbursements' })
  listReimbursements(@CurrentUser() user: IAuthUser) {
    return this.pettyCashService.listReimbursements(user.tenantId);
  }

  @Post('reimbursements')
  @RequirePermissions('accounting:create')
  @ApiOperation({ summary: 'Reimburse an approved expense claim' })
  createReimbursement(@CurrentUser() user: IAuthUser, @Body() dto: ReimburseClaimDto) {
    return this.pettyCashService.reimburseClaim(
      user.tenantId,
      user.branchId ?? undefined,
      user.id,
      dto,
    );
  }

  // ── Sprint 9 Fixed Assets ──────────────────────────────────────────

  @Get('fixed-assets/summary')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Fixed asset register summary' })
  fixedAssetSummary(@CurrentUser() user: IAuthUser) {
    return this.fixedAssetsService.getRegisterSummary(user.tenantId);
  }

  @Get('fixed-assets/categories')
  @RequirePermissions('accounting:read')
  listFaCategories(
    @CurrentUser() user: IAuthUser,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.fixedAssetsService.listCategories(
      user.tenantId,
      includeInactive === 'true' || includeInactive === '1',
    );
  }

  @Post('fixed-assets/categories')
  @RequirePermissions('accounting:create')
  createFaCategory(@CurrentUser() user: IAuthUser, @Body() dto: CreateFixedAssetCategoryDto) {
    return this.fixedAssetsService.createCategory(user.tenantId, dto);
  }

  @Post('fixed-assets/categories/seed-defaults')
  @RequirePermissions('accounting:create')
  seedFaCategories(@CurrentUser() user: IAuthUser) {
    return this.fixedAssetsService.seedCategories(user.tenantId);
  }

  @Get('fixed-assets')
  @RequirePermissions('accounting:read')
  listFixedAssets(
    @CurrentUser() user: IAuthUser,
    @Query('status') status?: FixedAssetStatus,
    @Query('branchId') branchId?: string,
  ) {
    return this.fixedAssetsService.listAssets(user.tenantId, status, branchId);
  }

  @Post('fixed-assets')
  @RequirePermissions('accounting:create')
  createFixedAsset(@CurrentUser() user: IAuthUser, @Body() dto: CreateFixedAssetDto) {
    return this.fixedAssetsService.createAsset(
      user.tenantId,
      user.branchId ?? undefined,
      user.id,
      dto,
    );
  }

  @Get('fixed-assets/:id')
  @RequirePermissions('accounting:read')
  getFixedAsset(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.fixedAssetsService.getAsset(id, user.tenantId);
  }

  @Put('fixed-assets/:id')
  @RequirePermissions('accounting:update')
  updateFixedAsset(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateFixedAssetDto,
  ) {
    return this.fixedAssetsService.updateAsset(id, user.tenantId, dto);
  }

  @Get('fixed-assets/:id/schedule')
  @RequirePermissions('accounting:read')
  faSchedule(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.fixedAssetsService.getSchedule(id, user.tenantId);
  }

  @Post('fixed-assets/depreciation/run')
  @RequirePermissions('accounting:create')
  runFaDepreciation(@CurrentUser() user: IAuthUser, @Body() dto: RunDepreciationDto) {
    return this.fixedAssetsService.runDepreciation(
      user.tenantId,
      user.branchId ?? undefined,
      user.id,
      dto,
    );
  }

  @Post('fixed-assets/:id/dispose')
  @RequirePermissions('accounting:update')
  disposeFixedAsset(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() dto: DisposeFixedAssetDto,
  ) {
    return this.fixedAssetsService.disposeAsset(
      user.tenantId,
      user.branchId ?? undefined,
      user.id,
      id,
      dto,
    );
  }

  @Post('fixed-assets/:id/transfer')
  @RequirePermissions('accounting:update')
  transferFixedAsset(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() dto: TransferFixedAssetDto,
  ) {
    return this.fixedAssetsService.transferAsset(user.tenantId, user.id, id, dto);
  }

  // ── Sprint 10 Payroll ──────────────────────────────────────────────

  @Get('payroll/dashboard')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Payroll dashboard for month' })
  payrollDashboard(
    @CurrentUser() user: IAuthUser,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    return this.payrollService.getDashboard(
      user.tenantId,
      month ? parseInt(month, 10) : undefined,
      year ? parseInt(year, 10) : undefined,
    );
  }

  @Get('payroll/settings')
  @RequirePermissions('accounting:read')
  getPayrollSettings(@CurrentUser() user: IAuthUser) {
    return this.payrollService.getSettings(user.tenantId);
  }

  @Put('payroll/settings')
  @RequirePermissions('accounting:update')
  updatePayrollSettings(@CurrentUser() user: IAuthUser, @Body() dto: UpdatePayrollSettingsDto) {
    return this.payrollService.updateSettings(user.tenantId, dto);
  }

  @Get('payroll/components')
  @RequirePermissions('accounting:read')
  listPayrollComponents(
    @CurrentUser() user: IAuthUser,
    @Query('type') type?: PayrollComponentType,
  ) {
    return this.payrollService.listComponents(user.tenantId, type);
  }

  @Post('payroll/components')
  @RequirePermissions('accounting:create')
  createPayrollComponent(@CurrentUser() user: IAuthUser, @Body() dto: CreatePayrollComponentDto) {
    return this.payrollService.createComponent(user.tenantId, dto);
  }

  @Post('payroll/components/seed-defaults')
  @RequirePermissions('accounting:create')
  seedPayrollComponents(@CurrentUser() user: IAuthUser) {
    return this.payrollService.seedComponents(user.tenantId);
  }

  @Get('payroll/runs')
  @RequirePermissions('accounting:read')
  listPayrollRuns(@CurrentUser() user: IAuthUser) {
    return this.payrollService.listRuns(user.tenantId);
  }

  @Get('payroll/runs/:id')
  @RequirePermissions('accounting:read')
  getPayrollRun(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.payrollService.getRun(id, user.tenantId);
  }

  @Post('payroll/runs/process')
  @RequirePermissions('accounting:create')
  @ApiOperation({ summary: 'Calculate salary run with EPF/ETF' })
  processPayrollRun(@CurrentUser() user: IAuthUser, @Body() dto: ProcessPayrollRunDto) {
    return this.payrollService.processRun(user.tenantId, user.id, dto);
  }

  @Post('payroll/runs/:id/approve')
  @RequirePermissions('accounting:update')
  approvePayrollRun(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.payrollService.approveRun(id, user.tenantId);
  }

  @Post('payroll/runs/:id/pay')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Pay run, post GL journal, issue payslips' })
  payPayrollRun(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() dto: PayPayrollRunDto,
  ) {
    return this.payrollService.payRun(
      user.tenantId,
      user.branchId ?? undefined,
      user.id,
      id,
      dto,
    );
  }

  @Get('payroll/payslips')
  @RequirePermissions('accounting:read')
  listPayslips(
    @CurrentUser() user: IAuthUser,
    @Query('periodLabel') periodLabel?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.payrollService.listPayslips(user.tenantId, periodLabel, employeeId);
  }

  @Get('payroll/payslips/:id')
  @RequirePermissions('accounting:read')
  getPayslip(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.payrollService.getPayslip(id, user.tenantId);
  }

  @Put('payroll/employees/:id/statutory')
  @RequirePermissions('hr:update')
  updateEmployeeStatutory(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeStatutoryDto,
  ) {
    return this.payrollService.updateEmployeeStatutory(user.tenantId, id, dto);
  }

  // ── Sprint 11 Financial Reports ────────────────────────────────────

  @Get('reports/catalog')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'List available financial reports' })
  reportsCatalog() {
    return {
      reports: [
        { id: 'trial-balance', name: 'Trial Balance', needsPeriod: false },
        { id: 'profit-loss', name: 'Profit & Loss', needsPeriod: true },
        { id: 'balance-sheet', name: 'Balance Sheet', needsPeriod: false },
        { id: 'cash-flow', name: 'Cash Flow', needsPeriod: true },
        { id: 'general-ledger', name: 'General Ledger', needsPeriod: true, needsAccount: true },
        { id: 'customer-statement', name: 'Customer Statement', needsPeriod: true, needsCustomer: true },
        { id: 'supplier-statement', name: 'Supplier Statement', needsPeriod: true, needsSupplier: true },
        { id: 'vat', name: 'VAT Report', needsPeriod: true },
      ],
      formats: ['json', 'pdf', 'xlsx'],
    };
  }

  @Get('reports/:type')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Generate financial report (JSON)' })
  generateFinancialReport(
    @CurrentUser() user: IAuthUser,
    @Param('type') type: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('accountId') accountId?: string,
    @Query('customerId') customerId?: string,
    @Query('supplierId') supplierId?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.financialReportsService.generate(user.tenantId, type, {
      startDate,
      endDate,
      accountId,
      customerId,
      supplierId,
      branchId,
    });
  }

  @Get('reports/:type/export')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Export financial report as PDF or Excel' })
  async exportFinancialReport(
    @CurrentUser() user: IAuthUser,
    @Param('type') type: string,
    @Res({ passthrough: true }) res: Response,
    @Query('format') format?: 'pdf' | 'xlsx',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('accountId') accountId?: string,
    @Query('customerId') customerId?: string,
    @Query('supplierId') supplierId?: string,
    @Query('branchId') branchId?: string,
  ) {
    const fmt = format === 'xlsx' ? 'xlsx' : 'pdf';
    const out = await this.financialReportsService.export(user.tenantId, type, fmt, {
      startDate,
      endDate,
      accountId,
      customerId,
      supplierId,
      branchId,
    });
    res.set({
      'Content-Type': out.contentType,
      'Content-Disposition': `attachment; filename="${out.filename}"`,
    });
    return out.file;
  }

  // ── Financial Periods (Sprint 2) ───────────────────────────────────

  @Get('fiscal-years')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'List fiscal years' })
  listFiscalYears(@CurrentUser() user: IAuthUser) {
    return this.periodsService.listFiscalYears(user.tenantId);
  }

  @Get('fiscal-years/current')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Current fiscal year + period' })
  currentFiscalContext(@CurrentUser() user: IAuthUser) {
    return this.periodsService.getCurrentContext(user.tenantId);
  }

  @Get('fiscal-years/:id')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Get fiscal year with periods' })
  getFiscalYear(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.periodsService.getFiscalYear(id, user.tenantId);
  }

  @Post('fiscal-years')
  @RequirePermissions('accounting:create')
  @ApiOperation({ summary: 'Create fiscal year and monthly periods' })
  createFiscalYear(@CurrentUser() user: IAuthUser, @Body() dto: CreateFiscalYearDto) {
    return this.periodsService.createFiscalYear(user.tenantId, user.id, dto);
  }

  @Put('fiscal-years/:id')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Update fiscal year settings' })
  updateFiscalYear(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: UpdateFiscalYearDto) {
    return this.periodsService.updateFiscalYearSettings(id, user.tenantId, dto);
  }

  @Get('fiscal-years/:id/year-end-preview')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Preview year-end closing rules and amounts' })
  yearEndPreview(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.periodsService.previewYearEndClose(id, user.tenantId);
  }

  @Post('fiscal-years/:id/close')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Year-end close (lock periods + closing journal)' })
  closeFiscalYear(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: CloseFiscalYearDto) {
    return this.periodsService.closeFiscalYear(
      id,
      user.tenantId,
      user.branchId ?? '',
      user.id,
      dto,
    );
  }

  @Post('fiscal-years/:id/reopen')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Reopen closed fiscal year and reverse year-end closing journal' })
  reopenFiscalYear(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: ClosePeriodDto) {
    return this.periodsService.reopenFiscalYear(id, user.tenantId, user.id, dto.notes);
  }

  @Post('fiscal-years/:id/close-periods')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Close all open periods in a fiscal year' })
  closeAllPeriods(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.periodsService.closeAllOpenPeriods(id, user.tenantId, user.id);
  }

  @Get('periods')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'List accounting periods' })
  listPeriods(@CurrentUser() user: IAuthUser, @Query('fiscalYearId') fiscalYearId?: string) {
    return this.periodsService.listPeriods(user.tenantId, fiscalYearId);
  }

  @Post('periods/:id/close')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Close an accounting period' })
  closePeriod(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: ClosePeriodDto) {
    return this.periodsService.closePeriod(id, user.tenantId, user.id, dto.notes);
  }

  @Post('periods/:id/reopen')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Reopen a closed accounting period' })
  reopenPeriod(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: ClosePeriodDto) {
    return this.periodsService.reopenPeriod(id, user.tenantId, user.id, dto.notes);
  }

  // ── Sprint 13 Accounting Settings ──────────────────────────────────

  @Get('settings/number-series')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'List document number series' })
  listNumberSeries(@CurrentUser() user: IAuthUser) {
    return this.settingsService.listNumberSeries(user.tenantId);
  }

  @Post('settings/number-series/seed')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Seed default number series' })
  seedNumberSeries(@CurrentUser() user: IAuthUser) {
    return this.settingsService.ensureNumberSeries(user.tenantId);
  }

  @Put('settings/number-series/:key')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Update a document number series' })
  updateNumberSeries(
    @CurrentUser() user: IAuthUser,
    @Param('key') key: string,
    @Body() dto: UpdateNumberSeriesDto,
  ) {
    return this.settingsService.updateNumberSeries(user.tenantId, key, dto);
  }

  @Get('settings/preferences')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Get accounting preferences' })
  getPreferences(@CurrentUser() user: IAuthUser) {
    return this.settingsService.getPreferences(user.tenantId);
  }

  @Put('settings/preferences')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Update accounting preferences' })
  updatePreferences(@CurrentUser() user: IAuthUser, @Body() dto: UpdateAccountingPreferencesDto) {
    return this.settingsService.updatePreferences(user.tenantId, dto);
  }
}

@Module({
  imports: [AuditLogModule, CustomersModule, SuppliersModule],
  controllers: [AccountingController, AdvancedAccountingController],
  providers: [
    AccountingService,
    FinanceService,
    FinancialPeriodsService,
    JournalEntriesService,
    TaxService,
    PettyCashService,
    FixedAssetsService,
    PayrollService,
    FinancialReportsService,
    AccountingSettingsService,
    AccountingBootstrapService,
    AccountingPostingService,
    AccountingOutboxService,
    AccountingAutomationListener,
    AdvancedAccountingService,
  ],
  exports: [
    AccountingService,
    FinanceService,
    FinancialPeriodsService,
    JournalEntriesService,
    TaxService,
    PettyCashService,
    FixedAssetsService,
    PayrollService,
    FinancialReportsService,
    AccountingSettingsService,
    AccountingBootstrapService,
    AccountingPostingService,
    AccountingOutboxService,
    AdvancedAccountingService,
  ],
})
export class AccountingModule {}
