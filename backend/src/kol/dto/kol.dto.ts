import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class AuthorsListDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  platformId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  fansMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  fansMax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priceMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priceMax?: number;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  sortOrder?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  currentPage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pageSize?: number;
}

export class CollectDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  authorIds: string[];
}

export class UpdateCreatorDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  persona?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(20)
  contactPhone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactWechat?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  contactMail?: string | null;

  @IsOptional()
  @IsString()
  contactStatus?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ownerId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remark?: string | null;
}

export class ReviewActionDto {
  @IsString()
  reason: string;
}
