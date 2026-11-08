// 抓取调度：HOTSPOT_SCRAPE_ENABLED=1 时按 HOTSPOT_SCRAPE_INTERVAL_MINUTES（默认30分钟）跑一轮到期抓取
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HotspotService } from './hotspot.service';

@Injectable()
export class HotspotScheduler implements OnModuleInit {
  private readonly logger = new Logger(HotspotScheduler.name);

  constructor(private hotspot: HotspotService) {}

  onModuleInit() {
    if (process.env.HOTSPOT_SCRAPE_ENABLED !== '1') {
      this.logger.log('热点抓取调度未启用（HOTSPOT_SCRAPE_ENABLED≠1），仅支持手动触发');
      return;
    }
    const minutes = this.hotspot.roundIntervalMinutes;
    setInterval(
      () => {
        this.hotspot.runScrapeRound().catch((e) => this.logger.warn(`调度轮异常: ${(e as Error).message?.split('\n')[0]}`));
      },
      minutes * 60 * 1000,
    );
    this.logger.log(`热点抓取调度已启动：每 ${minutes} 分钟一轮（关键词 ${process.env.HOTSPOT_KEYWORD_INTERVAL_HOURS ?? 6}h 到期，竞品 ${
      process.env.HOTSPOT_COMPETITOR_INTERVAL_HOURS ?? 24
    }h 到期）`);
  }
}
