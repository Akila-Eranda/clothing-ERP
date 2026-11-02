/** Request bodies for the Platform Admin console and tenant feature suggestions. */

import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'
import { FeatureSuggestionPriority, FeatureSuggestionStatus } from '@prisma/client'

// ── Announcements ──────────────────────────────────────────

export class CreateAnnouncementDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) title: string
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(5000) body: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) type?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) target?: string
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(5000) @IsString({ each: true }) targetTenants?: string[]
  @ApiPropertyOptional() @IsOptional() @IsBoolean() dismissible?: boolean
  @ApiPropertyOptional() @IsOptional() @IsDateString() scheduledAt?: string | null
  @ApiPropertyOptional() @IsOptional() @IsBoolean() sendNow?: boolean
}

export class UpdateAnnouncementDto extends PartialType(OmitType(CreateAnnouncementDto, ['sendNow'] as const)) {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) status?: string
}

// ── Releases ───────────────────────────────────────────────

export class ReleaseItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) category?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) module?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) featureName?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) badge?: string
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) displayOrder?: number
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) imageUrl?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) videoUrl?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) docUrl?: string
  /** Legacy admin UI keys (title/body/type), sent alongside featureName/description/category. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) title?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) body?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) type?: string
}

export class CreateReleaseDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(40) version: string
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) title: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) summary?: string
  @ApiPropertyOptional() @IsOptional() @IsDateString() releaseDate?: string
  @ApiPropertyOptional() @IsOptional() @IsBoolean() popupEnabled?: boolean
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) targetType?: string
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) targetPlans?: string[]
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) targetTenants?: string[]
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) targetBranches?: string[]
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) imageUrl?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) videoUrl?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) docUrl?: string
  @ApiPropertyOptional({ type: [ReleaseItemDto] })
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ReleaseItemDto)
  items?: ReleaseItemDto[]
}

export class UpdateReleaseDto extends PartialType(CreateReleaseDto) {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) status?: string
}

// ── Feature suggestions ────────────────────────────────────

export class UpdateSuggestionDto {
  @ApiPropertyOptional({ enum: FeatureSuggestionStatus }) @IsOptional() @IsEnum(FeatureSuggestionStatus) status?: FeatureSuggestionStatus
  @ApiPropertyOptional({ enum: FeatureSuggestionPriority }) @IsOptional() @IsEnum(FeatureSuggestionPriority) priority?: FeatureSuggestionPriority
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) publicResponse?: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) internalNote?: string
}

export class CreateSuggestionDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(60) category: string
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) title: string
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(5000) description: string
  @ApiPropertyOptional({ enum: FeatureSuggestionPriority }) @IsOptional() @IsEnum(FeatureSuggestionPriority) priority?: FeatureSuggestionPriority
}

// ── Support / admins / billing WhatsApp ────────────────────

export class CreateSupportNoteDto {
  @ApiPropertyOptional() @IsOptional() @IsString() tenantId?: string
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) title: string
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(10000) body: string
}

export const PLATFORM_ADMIN_ROLE_TYPES = ['SUPER_ADMIN', 'PLATFORM_STAFF'] as const

export class CreatePlatformAdminDto {
  @ApiProperty() @IsEmail() email: string
  @ApiProperty() @IsString() @MinLength(12, { message: 'Platform admin password must be at least 12 characters' }) @MaxLength(128) password: string
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(80) firstName: string
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(80) lastName: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) phone?: string
  @ApiPropertyOptional({ enum: PLATFORM_ADMIN_ROLE_TYPES }) @IsOptional() @IsIn(PLATFORM_ADMIN_ROLE_TYPES) roleType?: (typeof PLATFORM_ADMIN_ROLE_TYPES)[number]
}

export class BillingWhatsAppTestDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(30) phone: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) message?: string
}

export class BillingWhatsAppOnboardDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(30) phone: string
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(120) businessName: string
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(63) subdomain: string
  @ApiProperty() @IsEmail() ownerEmail: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(128) tempPassword?: string
}

export class BillingWhatsAppTenantDto {
  @ApiProperty() @IsString() @IsNotEmpty() tenantId: string
}
