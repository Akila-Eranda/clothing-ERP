import {
  IsString, IsOptional, IsNumber, IsEnum, IsInt, Min, IsArray, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StockMovementType } from '@prisma/client';

export class AdjustStockDto {
  @ApiProperty() @IsString() variantId: string;
  @ApiProperty() @IsInt() quantity: number;
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
}

export class TransferItemDto {
  @ApiProperty() @IsString() variantId: string;
  @ApiProperty() @IsInt() @Min(1) requestedQty: number;
  @ApiPropertyOptional() @IsOptional() @IsString() lotId?: string;
}

export class LotAdjustDto {
  @ApiProperty() @IsString() lotId: string;
  @ApiProperty() @IsInt() quantity: number;
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
