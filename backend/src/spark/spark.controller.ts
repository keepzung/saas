import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SparkService } from './spark.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class SparkController {
  constructor(private sparkService: SparkService) {}

  @Post('spark/sync')
  async sync(
    @Body()
    dto: {
      date?: string;
      type?: string;
      backfill?: boolean;
      full?: boolean;
      promoted?: boolean;
      brandId?: string | number;
    },
  ) {
    const type = dto?.type ?? 'all';
    const noteOpts = {
      backfill: !!dto?.backfill,
      full: !!dto?.full,
      promoted: !!dto?.promoted,
    };
    // 指定 brandId → 只同步该组织；否则遍历全部活跃组织
    const brandIds = dto?.brandId
      ? [Number(dto.brandId)]
      : (await this.sparkService.activeOrgBrandIds());
    const results = [];
    for (const brandId of brandIds) {
      const ctx = await this.sparkService.orgCtx(brandId);
      if (!ctx) continue;
      if (type === 'campaign') {
        results.push(await this.sparkService.syncCampaign(dto?.date, ctx));
      } else if (type === 'notes') {
        results.push(await this.sparkService.syncNotes(dto?.date, noteOpts, ctx));
      } else {
        results.push({
          brandId,
          campaign: await this.sparkService.syncCampaign(dto?.date, ctx),
          notes: await this.sparkService.syncNotes(dto?.date, noteOpts, ctx),
        });
      }
    }
    return brandIds.length === 1 ? results[0] : results;
  }

  @Get('spark/status')
  status(@Query('brandId') brandId?: string) {
    return this.sparkService.status(brandId);
  }

  @Get('spark/logs')
  logs(
    @Query()
    query: { page?: string; page_size?: string; syncType?: string; brandId?: string },
  ) {
    return this.sparkService.logs(query);
  }

  @Get('spark/campaign/summary')
  campaignSummary(
    @Query()
    query: { start?: string; end?: string; brandId?: string; scope?: string },
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
      scope?: string;
    },
  ) {
    return this.sparkService.campaignAccounts(query);
  }

  @Get('spark/accounts')
  accounts(
    @Query()
    query: {
      keyword?: string;
      active?: string;
      scope?: string;
      page?: string;
      page_size?: string;
    },
  ) {
    return this.sparkService.accounts(query);
  }

  @Put('spark/accounts/:id/scope')
  updateAccountScope(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { scope?: string },
  ) {
    if (!dto?.scope) throw new BadRequestException('scope 不能为空');
    return this.sparkService.updateAccountScope(id, dto.scope);
  }

  @Post('spark/cookie')
  updateCookie(@Body() dto: { cookie?: string; brandId?: string | number }) {
    if (!dto?.cookie || !dto.cookie.trim()) {
      throw new Error('cookie 不能为空');
    }
    return this.sparkService.updateCookie(
      dto.cookie.trim(),
      dto.brandId != null ? String(dto.brandId) : undefined,
    );
  }

  @Get('spark/campaign/region')
  campaignRegion(
    @Query()
    query: {
      start?: string;
      end?: string;
      brandId?: string;
      scope?: string;
      groupby?: string;
    },
  ) {
    return this.sparkService.campaignRegion(query);
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
