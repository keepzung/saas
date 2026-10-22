-- 星火笔记明细分析·媒体级自然指标（自然曝光量 ziran_imp_cnt / 自然阅读量 ziran_read_cnt / 竞价推广互动量 ads_rtb_engage_cnt）
-- MDD 运营总览「内容发布&互动」自然三数口径切换：总−投放(聚光日报) → 明细分析自然流量效果列
ALTER TABLE "KoxNote" ADD COLUMN "naturalExposure" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "naturalViews" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "rtbEngage" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "KoxNoteDailyStat" ADD COLUMN "naturalExposure" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "naturalViews" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "rtbEngage" INTEGER NOT NULL DEFAULT 0;
