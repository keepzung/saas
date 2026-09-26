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
  sync(@Body() dto: { fromTm?: number; toTm?: number }) {
    return this.laiguService.syncLeads({
      fromTm: Number(dto?.fromTm) || undefined,
      toTm: Number(dto?.toTm) || undefined,
    });
  }
}
