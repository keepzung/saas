/**
 * 中文无分词库关键词抽取（词云/高频话题共用）
 * 策略：英数连续段整体成词；中文段滑窗 2/3/4-gram；停用字过滤；
 * 长词优先合并（短 gram 被高频长 gram 覆盖时去短留长）。
 */
const STOP_SINGLE = new Set(
  '的了是在有和就不好要都也很到说要去我会被他她它这那个又没为上下中大小啊呢吧呀哦嘛么之与其把被让向往从对但是而或并且等把'.split(''),
);

export function extractKeywords(
  texts: (string | null | undefined)[],
  limit = 42,
): { text: string; count: number }[] {
  const freq = new Map<string, number>();
  const bump = (w: string) => {
    if (w) freq.set(w, (freq.get(w) ?? 0) + 1);
  };
  for (const raw of texts) {
    if (!raw) continue;
    const s = String(raw);
    for (const m of s.matchAll(/[A-Za-z]+[A-Za-z0-9]*|[0-9]+[A-Za-z][A-Za-z0-9]*/g)) {
      if (m[0].length >= 2) bump(m[0]);
    }
    for (const m of s.matchAll(/[\u4e00-\u9fa5]{2,}/g)) {
      const seg = m[0];
      for (let n = 2; n <= 4; n++) {
        for (let i = 0; i + n <= seg.length; i++) {
          const g = seg.slice(i, i + n);
          if (STOP_SINGLE.has(g[0]) || STOP_SINGLE.has(g[g.length - 1])) continue;
          bump(g);
        }
      }
    }
  }
  const sorted = [...freq.entries()].sort(
    (a, b) => b[1] - a[1] || b[0].length - a[0].length,
  );
  const kept: { text: string; count: number }[] = [];
  const tol = (n: number) => Math.max(2, Math.round(n * 0.15));
  for (const [text, count] of sorted) {
    if (count < 2 && kept.length >= 12) break;
    const covered = kept.some(
      (k) => k.text.includes(text) && k.count >= count - tol(count),
    );
    if (covered) continue;
    const idx = kept.findIndex(
      (k) => text.includes(k.text) && count >= k.count - tol(k.count),
    );
    if (idx >= 0 && text.length > kept[idx].text.length) {
      kept[idx] = { text, count };
    } else {
      kept.push({ text, count });
    }
    if (kept.length >= limit) break;
  }
  return kept;
}
