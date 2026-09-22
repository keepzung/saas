import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SparkService } from './spark.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class SparkController {
  constructor(private sparkService: SparkService) {}

  @Post('spark/sync')
  sync(@Body() dto: { date?: string; type?: string; backfill?: boolean }) {
    const type = dto?.type ?? 'all';
    if (type === 'campaign') return this.sparkService.syncCampaign(dto?.date);
    if (type === 'notes')
      return this.sparkService.syncNotes(dto?.date, { backfill: !!dto?.backfill });
    return Promise.all([
      this.sparkService.syncCampaign(dto?.date),
      this.sparkService.syncNotes(dto?.date, { backfill: !!dto?.backfill }),
    ]).then(([campaign, notes]) => ({ campaign, notes }));
  }

  @Get('spark/status')
  status() {
    return this.sparkService.status();
  }

  @Get('spark/logs')
  logs(@Query() query: { page?: string; page_size?: string; syncType?: string }) {
    return this.sparkService.logs(query);
  }

  @Get('spark/campaign/summary')
  campaignSummary(
    @Query() query: { start?: string; end?: string; brandId?: string },
  ) {
    return this.sparkService.campaignSummary(query);
  }

  @Get('spark/campaign/accounts')
  campaignAccounts(
    @Query()
    query: {
      start?: string;
      end?: string;
      keyword?: string;
      accountKind?: string;
      metric?: string;
      page?: string;
      page_size?: string;
      brandId?: string;
    },
  ) {
    return this.sparkService.campaignAccounts(query);
  }

  @Get('spark/accounts')
  accounts(
    @Query() query: { keyword?: string; active?: string; page?: string; page_size?: string },
  ) {
    return this.sparkService.accounts(query);
  }

  @Post('spark/cookie')
  updateCookie(@Body() dto: { cookie?: string }) {
    if (!dto?.cookie || !dto.cookie.trim()) {
      throw new Error('cookie 不能为空');
    }
    return this.sparkService.updateCookie(dto.cookie.trim());
  }

  @Get('spark/projects')
  projects(@Query() query: { brandId?: string; keyword?: string }) {
    return this.sparkService.projects(query);
  }

  @Post('spark/projects')
  createProject(
    @Body() dto: Record<string, unknown>,
    @Req() req: Request,
    @Query('brandId') brandId?: string,
  ) {
    const user = req.user as { id: number };
    return this.sparkService.createProject(dto as never, user.id, brandId);
  }

  @Delete('spark/projects/:id')
  deleteProject(@Param('id', ParseIntPipe) id: number) {
    return this.sparkService.deleteProject(id);
  }
}
