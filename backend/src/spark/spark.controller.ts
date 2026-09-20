import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SparkService } from './spark.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class SparkController {
  constructor(private sparkService: SparkService) {}

  @Post('spark/sync')
  sync(@Body() dto: { date?: string }) {
    return this.sparkService.syncCampaign(dto?.date);
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
}
