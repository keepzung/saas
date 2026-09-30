import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LaiguService } from './laigu.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class LaiguController {
  constructor(private laiguService: LaiguService) {}

  @Get('laigu/leads/stats')
  stats(@Query('brandId') brandId?: string) {
    return this.laiguService.stats(brandId);
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
      source?: string;
      from?: string;
      to?: string;
      brandId?: string;
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
}
