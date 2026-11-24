// MCC targetList 行 → 扁平键值 Map(targetList/targetVos 双形态兼容 + 顶层字段合并)。
// 从 spark.service.staffRowMap 抽出共享(线索/笔记×日/员工矩阵等全部 MCC 行解析共用)。

type RawRow = Record<string, unknown>;
type TargetEntry = {
  targetCode?: string;
  targetValue?: unknown;
  targetOriginValue?: unknown;
  targetDownloadValue?: unknown;
};

export function targetRowMap(r: RawRow): Map<string, unknown> {
  const m = new Map<string, unknown>();
  const list = Array.isArray(r.targetList)
    ? (r.targetList as TargetEntry[])
    : Array.isArray(r.targetVos)
      ? (r.targetVos as TargetEntry[])
      : [];
  for (const t of list ?? []) {
    const v = t.targetValue ?? t.targetOriginValue ?? t.targetDownloadValue;
    if (v != null && v !== '') m.set(String(t.targetCode), v);
  }
  for (const [k, v] of Object.entries(r)) {
    if (k !== 'targetList' && k !== 'targetVos' && v != null && v !== '') m.set(k, v);
  }
  return m;
}

/** MCC 报表数值统一解析(与 syncClueAnalysis/syncClueAcqTool 原 num 逐位一致:数字直取/剥千分位逗号/四舍五入取整) */
export function mccNum(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : 0;
  const s = String(v ?? '').replace(/,/g, '').trim();
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : 0;
}
