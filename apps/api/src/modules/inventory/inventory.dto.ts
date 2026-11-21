import {
  IsString, IsOptional, IsNumber, IsEnum, Min, IsArray, ValidateNested, Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StockMovementType, TransferStatus } from '@prisma/client';

export class AdjustStockDto {
  @ApiProperty() @IsString() variantId: string;
  @ApiProperty() @IsNumber() quantity: number;
  @ApiProperty({ enum: StockMovementType }) @IsEnum(StockMovementType) movementType: StockMovementType;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() referenceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() referenceType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() batchNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() expiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() manufactureDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lotId?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() unitCost?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() warehouseId?: string;
  /** Idempotency key (8-64 chars): a retry with the same key returns the first result and adjusts nothing. */
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{8,64}$/) clientRequestId?: string;
}

export class TransferStatusDto {
  @ApiProperty({ enum: TransferStatus }) @IsEnum(TransferStatus) status: TransferStatus;
}

export class TransferItemDto {
  @ApiProperty() @IsString() variantId: string;
  @ApiProperty() @IsNumber() @Min(0.001) requestedQty: number;
  @ApiPropertyOptional() @IsOptional() @IsString() lotId?: string;
}

export class LotAdjustDto {
  @ApiProperty() @IsString() lotId: string;
  @ApiProperty() @IsNumber() quantity: number;
  @ApiProperty({ enum: StockMovementType }) @IsEnum(StockMovementType) movementType: StockMovementType;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreateTransferDto {
  @ApiPropertyOptional() @IsOptional() @IsString() fromBranchId?: string;
  @ApiProperty() @IsString() toBranchId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fromWarehouseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() toWarehouseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiProperty({ type: [TransferItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferItemDto)
  items: TransferItemDto[];
}
