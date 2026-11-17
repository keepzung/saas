import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DmBotService } from './dm-bot.service';
import { LaiguService } from './laigu.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class LaiguController {
  constructor(
    private laiguService: LaiguService,
    private dmBotService: DmBotService,
  ) {}

  @Get('laigu/leads/stats')
  stats(@Query('brandId') brandId?: string) {
    return this.laiguService.stats(brandId);
  }

  @Get('laigu/leads/kos-tree')
  kosTree(@Query('brandId') brandId?: string) {
    return this.laiguService.kosTree(brandId);
  }

  @Patch('laigu/leads/:id/tags')
  updateTags(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { tags?: string[] },
  ) {
    return this.laiguService.updateTags(id, dto?.tags);
  }

  @Get('laigu/feedback/analysis')
  feedbackAnalysis(@Query() query: { brandId?: string; days?: string }) {
    return this.laiguService.feedbackAnalysis(query);
  }

  @Get('laigu/leads')
  leads(
    @Query()
    query: {
      page?: string;
      page_size?: string;
      keyword?: string;
      isResource?: string;
      hasPhone?: string;
      hasClientMessage?: string;
      source?: string;
      from?: string;
      to?: string;
      brandId?: string;
      kos?: string;
      uid?: string;
      tag?: string;
    },
  ) {
    return this.laiguService.leads(query);
  }

  @Get('laigu/leads/:id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.laiguService.leadDetail(id);
  }

  @Post('laigu/sync')
  sync(@Body() dto: { fromTm?: number; toTm?: number; brandId?: string | number; type?: string }) {
    // type=comments：来鼓评论同步（网关 token 通道）；缺省：会话同步（OpenAPI）
    if ((dto?.type ?? '') === 'comments') {
      return this.laiguService.syncComments(Number(dto?.brandId) || 6);
    }
    return this.laiguService.syncLeads({
      fromTm: Number(dto?.fromTm) || undefined,
      toTm: Number(dto?.toTm) || undefined,
    });
  }

  @Post('laigu/token')
  saveToken(@Body() dto: { brandId?: string | number; token?: string; agentId?: string }) {
    const brandId = Number(dto?.brandId ?? 6);
    const token = (dto?.token ?? '').trim();
    if (!token) throw new Error('token 不能为空');
    return this.laiguService.saveGatewayToken(brandId, token, dto?.agentId);
  }

  @Get('laigu/gateway-status')
  gatewayStatus(@Query('brandId') brandId?: string) {
    return this.laiguService.gatewayStatus(Number(brandId ?? 6));
  }

  @Get('laigu/comments/sample')
  commentSample(@Query('brandId') brandId?: string) {
    return this.laiguService.gatewayCommentSample(Number(brandId ?? 6));
  }

  // ─── 智能私信（DM bot）───────────────────────────────────────────
  @Get('laigu/dm/config')
  dmConfig(@Query('brandId') brandId?: string) {
    return this.dmBotService.ensureConfig(Number(brandId ?? 9));
  }

  @Put('laigu/dm/config')
  updateDmConfig(
    @Body() dto: {
      enabled?: boolean;
      autoReply?: boolean;
      dryRun?: boolean;
      slaMinutes?: number;
      contextTurns?: number;
      personaTemplateId?: number | null;
      personaOverrides?: Record<string, number> | null;
      notifyWecom?: boolean;
    },
    @Query('brandId') brandId?: string,
    @Req() req?: Request,
  ) {
    const role = (req?.user as { role?: string })?.role ?? '';
    if (!['ADMIN', 'MANAGER'].includes(role)) {
      throw new BadRequestException('仅管理员/经理可修改智能私信配置');
    }
    return this.dmBotService.updateConfig(Number(brandId ?? 9), dto);
  }

  /** 手动触发处理（dry-run 演示/补跑用；仅处理 enabled 品牌的待接待会话） */
  @Post('laigu/dm/process')
  processDm(@Query('brandId') brandId?: string, @Body() body?: { sessionId?: string; limit?: number }) {
    return this.dmBotService.processBrand(Number(brandId ?? 9), {
      sessionId: body?.sessionId,
      limit: body?.limit,
    });
  }

  @Get('laigu/dm/reply-logs')
  replyLogs(
    @Query() query: { brandId?: string; sessionId?: string; page?: string; pageSize?: string },
  ) {
    return this.dmBotService.replyLogs(Number(query.brandId ?? 9), query);
  }

  /** 人工接管开关：接管后 bot 不再处理该会话 */
  @Patch('laigu/leads/:id/takeover')
  takeover(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { takeover?: boolean },
  ) {
    return this.laiguService.setTakeover(id, Boolean(dto?.takeover));
  }

  @Get('laigu/dm/sla-stats')
  slaStats(@Query('brandId') brandId?: string, @Query('days') days?: string) {
    return this.dmBotService.slaStats(Number(brandId ?? 9), Number(days ?? 7) || 7);
  }

  // ─── 评论维护（东风日产建设项）────────────────────────────────────
  @Get('laigu/comments/list')
  commentList(
    @Query() query: { brandId?: string; page?: string; pageSize?: string; keyword?: string; sentiment?: string },
  ) {
    return this.laiguService.commentList(Number(query.brandId ?? 9), query);
  }

  /** 一键回复（dry-run：仅记录话术，待评论通道接入后真实发送） */
  @Post('laigu/comments/:id/reply')
  replyComment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { content?: string },
    @Query('brandId') brandId?: string,
  ) {
    if (!dto?.content?.trim()) throw new BadRequestException('回复内容不能为空');
    return this.laiguService.replyComment(Number(brandId ?? 9), id, dto.content.trim());
  }
}
