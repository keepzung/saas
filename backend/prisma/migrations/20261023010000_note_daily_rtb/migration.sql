-- 笔记日维度表补竞价推广逐日投放列（ads_rtb_imp_cnt/ads_rtb_click_cnt）
-- MDD 投流总览聚光投放口径=笔记报表（仅投放笔记，日维度窗口求和，2026-10-23 客户口径）
ALTER TABLE "KoxNoteDailyStat" ADD COLUMN "rtbImp" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "rtbClick" INTEGER NOT NULL DEFAULT 0;
