import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export interface AuditLogPayload {
  tenantId: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  oldData?: object;
  newData?: object;
  ipAddress?: string;
  userAgent?: string;
}

export class ClientAuditEventDto {
  @ApiProperty({ enum: ['PRINT', 'EXPORT'] })
  @IsIn(['PRINT', 'EXPORT', 'print', 'export'])
  action: string;

  @ApiProperty({ example: 'financial_report' })
  @IsString()
  @MaxLength(120)
  resource: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  resourceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
