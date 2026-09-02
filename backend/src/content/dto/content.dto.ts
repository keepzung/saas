import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ProductDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  parentId?: number | null;

  @IsString()
  @MaxLength(50)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  displayName?: string;

  @IsOptional()
  @IsString()
  configType?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  knowledge?: string;

  @IsOptional()
  @IsString()
  salesPolicy?: string;

  @IsOptional()
  @IsString()
  faq?: string;
}

export class MoveProductDto {
  @IsIn(['up', 'down'])
  direction: 'up' | 'down';
}

export class PackageDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  productId?: number | null;

  @IsOptional()
  @IsIn(['pro', 'simple'])
  workflowType?: string;

  @IsOptional()
  @IsIn([1, 2])
  reviewMode?: number;
}

export class MaterialDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  contentForm?: string;
}

export class MaterialUpdateDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class ReviewDto {
  @IsOptional()
  @IsString()
  comment?: string;
}

export class BatchTaskDto {
  @IsString()
  @MaxLength(100)
  taskName: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  productId?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  targetQuantity: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  packageId?: number;

  @IsOptional()
  @IsString()
  model?: string;
}

export class BatchMoveDto {
  @IsArray()
  ids: number[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  packageId?: number;
}

export class ImportProductRowDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  knowledge?: string;

  @IsOptional()
  @IsString()
  faq?: string;
}

export class ImportProductsDto {
  @IsString()
  @IsNotEmpty()
  categoryName: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ImportProductRowDto)
  products: ImportProductRowDto[];
}
