import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class WhatsappSendDto {
  @ApiProperty({ example: '0771234567' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty({ example: 'Hello from HexaOne POS' })
  @IsString()
  @MinLength(1)
  message!: string;
}

export class WhatsappSendBillDto {
  @ApiProperty({ example: '0771234567' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty({ example: 'INV-000123' })
  @IsString()
  @IsNotEmpty()
  invoiceNumber!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiProperty({ example: '4500.00' })
  @IsString()
  @IsNotEmpty()
  total!: string;

  @ApiPropertyOptional({ example: 'CASH' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({ description: 'Optional line items summary text' })
  @IsOptional()
  @IsString()
  itemsSummary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shopName?: string;
}
