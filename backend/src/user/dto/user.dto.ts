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
  // 4级账号体系：L2 工作区管理员 / L3 组织管理员 / L4 KOS 员工
  'brand_admin',
  'org_manager',
  'kos_operator',
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

// ─── 批量开通（4级账号：手机号即登录账号，KOS 员工可绑定小红书矩阵账号）───
export class BatchUserRowDto {
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  nickname?: string;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: '密码至少 8 位' })
  @MaxLength(64)
  password?: string;

  @IsOptional()
  @IsIn(['ADMIN', 'MANAGER', 'SALES'])
  role?: Role;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  moduleIds?: number[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BrandRoleDto)
  brandRoles?: BrandRoleDto[];

  @IsOptional()
  @IsInt()
  orgId?: number;

  /** 按名称找组织，不存在则自动创建（挂在 brandRoles[0].brandId 下） */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  orgName?: string;

  @IsOptional()
  @IsIn([1, 2, 3])
  orgLevel?: number;

  /** 绑定小红书矩阵账号（按昵称，brandRoles[0].brandId 下） */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  kosNickname?: string;
}

export class BatchCreateUsersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchUserRowDto)
  rows: BatchUserRowDto[];

  /** 缺省密码生成前缀：`Mdd@` + 手机号后 4 位 */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  passwordPrefix?: string;
}
