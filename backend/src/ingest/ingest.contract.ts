// 连接器契约(架构蓝图 v2 L2,借鉴 Singer/Airbyte 的 pull 契约):
// 连接器只负责「从源拉取并标准化」,不感知库表;持久化(syncXxx upsert)与调度留在编排层。
// P4 第一片只落线索两实体;notes/campaign/staff 连接器随后按同契约迁入。

/** 组织拉取上下文(与 SparkOrgCtx 同形,独立声明避免模块环) */
export interface PullCtx {
  brandId: number;
  orgCode: string;
  cookie: string;
  email?: string | null;
  channel?: string;
}

/** 所有连接器实现此接口;credentialDeps 供编排层做凭据前置校验 */
export interface SourceConnector {
  readonly id: string;
  readonly credentialDeps: string[];
}

/** 标准化行:实体名 + 业务键 + 指标 + 原始行(rawJson 落库用) */
export interface StandardRow<E extends string = string> {
  entity: E;
  keys: Record<string, string>;
  metrics: Record<string, number>;
  raw: Record<string, unknown>;
}

export interface RawBatch<R> {
  rows: R[];
  total: number;
}
