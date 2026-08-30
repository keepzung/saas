import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  clientName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  folderId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ownerId?: number;

  @IsOptional()
  @IsString()
  phase?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Date)
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  endDate?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  budgetTotal?: number;

  @IsOptional()
  @IsBoolean()
  serviceFeeEnabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  serviceFeeRate?: number;

  @IsOptional()
  @IsBoolean()
  taxFeeEnabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  taxFeeRate?: number;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  clientName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  folderId?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ownerId?: number;

  @IsOptional()
  @IsString()
  phase?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Date)
  startDate?: Date | null;

  @IsOptional()
  @Type(() => Date)
  endDate?: Date | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  budgetTotal?: number;

  @IsOptional()
  @IsBoolean()
  serviceFeeEnabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  serviceFeeRate?: number;

  @IsOptional()
  @IsBoolean()
  taxFeeEnabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  taxFeeRate?: number;
}

export class CreateFolderDto {
  @IsString()
  @MaxLength(50)
  name: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  parentId?: number | null;
}

export class UpdateFolderDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  parentId?: number | null;
}
