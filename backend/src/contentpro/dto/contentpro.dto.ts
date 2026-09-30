import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// ─── 素材库 ───────────────────────────────────────────────────────────
export class MaterialTagDto {
  @IsString() @MaxLength(50) name: string;
  @IsOptional() @IsInt() parentId?: number;
  @IsOptional() @IsInt() status?: number;
}

export class MaterialSetDto {
  @IsString() @MaxLength(50) name: string;
  @IsOptional() @IsInt() status?: number;
}

export class MaterialImageAssignDto {
  @IsArray() ids: number[];
  @IsOptional() setId?: number | null;
  @IsOptional() typeId?: number | null;
}

export class MaterialImageImportDto {
  @IsArray() urls: string[];
  @IsOptional() setId?: number | null;
  @IsOptional() typeId?: number | null;
  @IsOptional() productNodeId?: number | null;
}

// ─── 创作策略 ─────────────────────────────────────────────────────────
export class StrategyDto {
  @IsString() @MaxLength(60) name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() persona?: string[];
  @IsOptional() sellingPoints?: string[];
  @IsOptional() audience?: string[];
  @IsOptional() contentDirections?: { name: string; description?: string }[];
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsInt() sort?: number;
  @IsOptional() @IsInt() productId?: number | null;
}

// ─── AI 生成 ─────────────────────────────────────────────────────────
export class GenerateArticleDto {
  @IsInt() productId: number;
  @IsOptional() strategyId?: number | null;
  @IsOptional() @IsString() extra?: string;
  @IsOptional() @IsInt() strategyDirectionIndex?: number | null;
}

export class SaveArticleDto {
  @IsOptional() @IsInt() id?: number | null;
  @IsString() title: string;
  @IsString() content: string;
  @IsOptional() tags?: string[];
  @IsOptional() imgList?: string[];
  @IsOptional() coverUrl?: string | null;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsInt() status?: number;
  @IsOptional() @IsInt() contentTaskId?: number | null;
  @IsOptional() batchTaskId?: number | null;
}

export class BatchGenerateDto {
  @IsInt() productId: number;
  @IsOptional() strategyId?: number | null;
  @IsInt() @IsOptional() targetQuantity?: number;
  @IsOptional() @IsString() taskName?: string;
  @IsOptional() @IsString() extra?: string;
  @IsOptional() imageMode?: string;
}

// ─── 内容创作任务（任务分发）─────────────────────────────────────────
export class ContentTaskDto {
  @IsString() @MaxLength(80) name: string;
  @IsString() startTime: string;
  @IsString() endTime: string;
  @IsOptional() @IsString() platform?: string;
  @IsOptional() @IsString() scopeType?: string;
  @IsOptional() regions?: string[];
  @IsOptional() accountTypes?: string[];
  @IsOptional() exampleImages?: string[];
  @IsOptional() @IsString() exampleLink?: string;
  @IsOptional() @IsString() instructions?: string;
  @IsOptional() @IsString() reward?: string;
}
