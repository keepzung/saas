import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

type Role = 'ADMIN' | 'MANAGER' | 'SALES';

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
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(8, { message: '密码至少 8 位' })
  @MaxLength(64)
  password: string;
}
