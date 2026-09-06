import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FittingSessionStatus } from '@prisma/client';

export class CreateFloorDto {
  @ApiProperty() @IsString() branchId: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() code: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class UpdateFloorDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class CreateSectionDto {
  @ApiProperty() @IsString() floorId: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() code: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class UpdateSectionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class CreateRackDto {
  @ApiProperty() @IsString() sectionId: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() code: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class UpdateRackDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class CreateShelfDto {
  @ApiProperty() @IsString() rackId: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() code: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class UpdateShelfDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class SetVariantLocationDto {
  @ApiProperty() @IsString() branchId: string;
  @ApiProperty() @IsString() variantId: string;
  @ApiProperty() @IsString() shelfId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreateFashionColorDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() hex?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() swatchUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class UpdateFashionColorDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() hex?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() swatchUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class BundleComponentDto {
  @ApiProperty() @IsString() variantId: string;
  @ApiProperty() @IsNumber() @Min(0.001) quantity: number;
}

export class CreateBundleDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sku?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) sellingPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) costPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ type: [BundleComponentDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BundleComponentDto)
  components: BundleComponentDto[];
}

export class UpdateBundleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) sellingPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) costPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ type: [BundleComponentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BundleComponentDto)
  components?: BundleComponentDto[];
}

export class CreateFittingRoomDto {
  @ApiProperty() @IsString() branchId: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() code: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class UpdateFittingRoomDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class FittingSessionItemDto {
  @ApiProperty() @IsString() variantId: string;
  @ApiProperty() @IsInt() @Min(1) quantity: number;
}

export class CreateFittingSessionDto {
  @ApiProperty() @IsString() roomId: string;
  @ApiProperty() @IsString() branchId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiProperty({ type: [FittingSessionItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FittingSessionItemDto)
  items: FittingSessionItemDto[];
}

const FITTING_STATUS_TRANSITIONS = [
  FittingSessionStatus.RESERVED,
  FittingSessionStatus.SOLD,
  FittingSessionStatus.RETURNED,
  FittingSessionStatus.CANCELLED,
] as const;

export class UpdateFittingSessionStatusDto {
  @ApiProperty({ enum: FITTING_STATUS_TRANSITIONS })
  @IsIn(FITTING_STATUS_TRANSITIONS)
  status: (typeof FITTING_STATUS_TRANSITIONS)[number];
}
