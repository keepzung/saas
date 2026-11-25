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
  @IsOptional() productNodeId?: number | null;
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
  @IsOptional() @IsString() prompt?: string;
  @IsOptional() @IsString() mode?: string;
  @IsOptional() @IsString() formatText?: string;
  @IsOptional() requiredTags?: string[];
  @IsOptional() @IsString() forbiddenText?: string;
  @IsOptional() tone?: string[];
  @IsOptional() visual?: Record<string, unknown>;
  @IsOptional() boundProductIds?: number[];
}

// ─── 人设/钩子资源池 ─────────────────────────────────────────────────
export class PersonaDto {
  @IsString() @MaxLength(60) name: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsInt() sort?: number;
}

export class HookDto {
  @IsString() text: string;
  /** opening 开头 | closing 结尾 | any 不限 */
  @IsOptional() @IsString() position?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsInt() sort?: number;
}

// ─── AI 生成 ─────────────────────────────────────────────────────────
export class GenerateArticleDto {
  @IsInt() productId: number;
  @IsOptional() strategyId?: number | null;
  @IsOptional() @IsString() extra?: string;
  @IsOptional() @IsInt() strategyDirectionIndex?: number | null;
  @IsOptional() @IsString() directionName?: string | null;
  @IsOptional() @IsString() wordCount?: string | null;
  /** 笔记四分类：seeding 种草 | scene 场景 | life 生活 | policy 政策钩子 */
  @IsOptional() @IsString() noteKind?: string | null;
  /** 风格：brand 品牌模版 | kos KOS真人 */
  @IsOptional() @IsString() style?: string | null;
  /** 形态：image_text 图文（默认）| video_script 短视频口播脚本 */
  @IsOptional() @IsString() form?: string | null;
  /** 写作人设：从人设资源池选 1 个，填入策略提示词【人设】占位符 */
  @IsOptional() @IsInt() personaId?: number | null;
  /** 内容钩子：从钩子资源池勾选 N 个，填入【钩子】占位符 */
  @IsOptional() hookIds?: number[] | null;
}

export class GenerateStrategyDto {
  @IsOptional() @IsInt() productId?: number | null;
  @IsOptional() @IsString() angle?: string;
  @IsOptional() @IsString() viewpoint?: string;
  @IsOptional() @IsString() keyPoints?: string;
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
  @IsOptional() @IsString() noteKind?: string | null;
  @IsOptional() @IsString() style?: string | null;
  @IsOptional() @IsInt() aiScore?: number | null;
  @IsOptional() aiAudit?: Record<string, unknown> | null;
  @IsOptional() scriptJson?: Record<string, unknown> | null;
}

export class BatchGenerateDto {
  @IsInt() productId: number;
  @IsOptional() strategyId?: number | null;
  @IsInt() @IsOptional() targetQuantity?: number;
  @IsOptional() @IsString() taskName?: string;
  @IsOptional() @IsString() extra?: string;
  @IsOptional() @IsString() imageMode?: string;
  @IsOptional() @IsString() noteKind?: string | null;
  @IsOptional() @IsString() style?: string | null;
  @IsOptional() @IsString() form?: string | null;
  @IsOptional() items?: BatchGenerateItemDto[];
}

export class BatchGenerateItemDto {
  @IsOptional() strategyId?: number | null;
  @IsOptional() @IsString() directionName?: string | null;
  @IsInt() count: number;
  @IsOptional() @IsString() wordCount?: string | null;
}

// ─── 品牌模板库 / 规则库 / 案例库 ────────────────────────────────────
export class TemplateDto {
  /** script_spec 话术规范 | vehicle_template 车型内容模板 | compliance_template 合规模板 | persona 门店人设 */
  @IsString() kind: string;
  @IsString() @MaxLength(80) name: string;
  @IsOptional() @IsInt() productId?: number | null;
  @IsOptional() @IsString() summary?: string;
  content: Record<string, unknown>;
  @IsOptional() @IsInt() status?: number;
  @IsOptional() @IsString() remark?: string;
}

export class RuleDto {
  /** comment 评论 | dm 私信 | routing 分流 | compliance 合规红线 */
  @IsString() category: string;
  @IsString() @MaxLength(80) name: string;
  @IsString() pattern: string;
  /** flag 标记 | block 拦截 | route_human 转人工 */
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() replyHint?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class CaseDto {
  @IsString() @MaxLength(120) title: string;
  /** hot 爆款案例 | breakdown 拆解 | competitor 竞品动态 */
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() platform?: string;
  @IsOptional() @IsString() summary?: string;
  @IsOptional() structureJson?: Record<string, unknown> | null;
  @IsOptional() @IsInt() hotContentId?: number | null;
  @IsOptional() tags?: string[];
  @IsOptional() @IsBoolean() enabled?: boolean;
}

// ─── 内容包 Pro ──────────────────────────────────────────────────────
export class PackageDto {
  @IsString() @MaxLength(60) name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() productId?: number | null;
  @IsOptional() @IsBoolean() openFlag?: boolean;
  @IsOptional() @IsBoolean() claimOnce?: boolean;
  @IsOptional() @IsInt() reviewMode?: number;
}

export class MoveToPackageDto {
  @IsArray() historyIds: number[];
}

export class RejectDto {
  @IsOptional() @IsString() reason?: string;
}

export class DispatchDto {
  @IsArray() historyIds: number[];
  @IsInt() userId: number;
}

export class ClaimDto {
  @IsInt() packageId: number;
  @IsOptional() @IsString() source?: string;
}

export class QuotaGrantDto {
  @IsInt() amount: number;
  @IsOptional() @IsString() remark?: string;
}

export class ChuangkitImportDto {
  @IsString() url: string;
}

export class UpdateHistoryContentDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() tags?: string[];
  @IsOptional() imgList?: string[];
  @IsOptional() coverUrl?: string | null;
}

/** 任务修改（派发对象与状态不可改） */
export class ContentTaskDto {
  @IsString() @MaxLength(80) name: string;
  @IsString() startTime: string;
  @IsString() endTime: string;
  @IsOptional() @IsString() platform?: string;
  @IsOptional() @IsString() scopeType?: string;
  @IsOptional() regions?: string[];
  @IsOptional() accountTypes?: string[];
  @IsOptional() userIds?: number[];
  @IsOptional() exampleImages?: string[];
  @IsOptional() @IsString() exampleLink?: string;
  @IsOptional() @IsString() instructions?: string;
  @IsOptional() @IsString() reward?: string;
  /** 指定话题：员工笔记标题需包含任一话题才算完成任务 */
  @IsOptional() hashtags?: string[];
  /** 创作要求：正文最少字数（空=不要求） */
  @IsOptional() @IsInt() requireMinWords?: number | null;
  /** 创作要求：配图最少张数（空=不要求） */
  @IsOptional() @IsInt() requireMinImages?: number | null;
}

/** 任务修改（派发对象与状态不可改） */
export class UpdateContentTaskDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsString() startTime?: string;
  @IsOptional() @IsString() endTime?: string;
  @IsOptional() @IsString() platform?: string;
  @IsOptional() hashtags?: string[];
  @IsOptional() @IsInt() requireMinWords?: number | null;
  @IsOptional() @IsInt() requireMinImages?: number | null;
  @IsOptional() exampleImages?: string[];
  @IsOptional() @IsString() exampleLink?: string;
  @IsOptional() @IsString() instructions?: string;
  @IsOptional() @IsString() reward?: string;
}

// ─── 配图打包下载 ────────────────────────────────────────────────────
export class ImagesZipDto {
  @IsArray() urls: string[];
}
