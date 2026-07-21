import { IsString, IsOptional, IsNumber, Min, Max, IsBoolean, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StartWorkflowDto {
  @ApiProperty() @IsString() key: string;
  @ApiProperty() @IsString() entityType: string;
  @ApiProperty() @IsString() entityId: string;
  @ApiPropertyOptional() @IsOptional() metadata?: Record<string, unknown>;
}

export class ActOnTaskDto {
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}

export class UpdateWorkflowStepDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() approverRole?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsNumber() stepOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isRequired?: boolean;
}

export class UpdateWorkflowDefinitionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ type: [UpdateWorkflowStepDto] })
  @IsOptional()
  @IsArray()
  steps?: UpdateWorkflowStepDto[];
}

export class DiscountRequestDto {
  @ApiProperty() @IsNumber() amount: number;
  @ApiProperty() @IsString() reason: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() cartTotal?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(100) discountPercent?: number;
}
