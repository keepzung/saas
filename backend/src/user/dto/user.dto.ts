import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

type Role = 'ADMIN' | 'MANAGER' | 'SALES';

export const BRAND_ROLE_KEYS = [
  'agency_manager',
  'agency_executive',
  'brand_owner',
  'content_supplier',
  'media_partner',
] as const;

export class BrandRoleDto {
  @IsInt()
  brandId: number;

  @IsIn(BRAND_ROLE_KEYS)
  roleKey: string;
}

export class CreateUserDto {
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phone: string;

  @IsString()
  @MinLength(8, { message: '密码至少 8 位' })
  @MaxLength(64)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  nickname?: string;

  @IsIn(['ADMIN', 'MANAGER', 'SALES'])
  role: Role;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  moduleIds?: number[];
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nickname?: string;

  @IsOptional()
  @IsIn(['ADMIN', 'MANAGER', 'SALES'])
  role?: Role;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  moduleIds?: number[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  brandIds?: number[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BrandRoleDto)
  brandRoles?: BrandRoleDto[];
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(8, { message: '密码至少 8 位' })
  @MaxLength(64)
  password: string;
}
