import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ContentproModule } from '../contentpro/contentpro.module';
import { HotspotController } from './hotspot.controller';
import { HotspotService } from './hotspot.service';
import { BreakdownService } from './breakdown.service';
import { VideoService } from './video.service';
import { MatchService } from './match.service';
import { CreationService } from './creation.service';
import { SessionStore } from './scraper/session.store';
import { HotspotScheduler } from './hotspot.scheduler';

@Module({
  imports: [PrismaModule, ContentproModule],
  controllers: [HotspotController],
  providers: [
    HotspotService,
    BreakdownService,
    VideoService,
    MatchService,
    CreationService,
    SessionStore,
    HotspotScheduler,
  ],
})
export class HotspotModule {}
