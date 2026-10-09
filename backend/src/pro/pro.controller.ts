import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProService } from './pro.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class ProController {
  constructor(private pro: ProService) {}

  @Get('pro/status')
  status(@Query('brandId') brandId?: string) {
    return this.pro.status(Number(brandId ?? 6));
  }

  @Post('pro/sync')
  sync(@Body() body: { brandId?: string | number }) {
    return this.pro.sync(Number(body?.brandId ?? 6));
  }

  /** E 逐日历史回填：body { brandId?, from, to }（YYYY-MM-DD，跨度≤62天） */
  @Post('pro/sync/backfill')
  backfill(@Body() body: { brandId?: string | number; from?: string; to?: string }) {
    return this.pro.syncRange(
      Number(body?.brandId ?? 6),
      String(body?.from ?? ''),
      String(body?.to ?? ''),
    );
  }

  @Post('pro/storage-state')
  saveStorageState(
    @Body() body: { brandId?: string | number; storageState?: string },
  ) {
    const brandId = Number(body?.brandId ?? 6);
    const storageState = (body?.storageState ?? '').trim();
    if (!storageState) throw new Error('storageState 不能为空');
    return this.pro.saveStorageState(brandId, storageState);
  }
}
