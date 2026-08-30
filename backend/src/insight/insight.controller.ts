import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InsightService } from './insight.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class InsightController {
  constructor(private insightService: InsightService) {}

  @Get('insight/brand/overview')
  overview(@Query() query: { start?: string; end?: string; platform?: string }) {
    return this.insightService.overview(query);
  }

  @Get('insight/brand/contents')
  contents(
    @Query()
    query: {
      page?: string;
      page_size?: string;
      platform?: string;
      sentiment?: string;
      keyword?: string;
    },
  ) {
    return this.insightService.contents(query);
  }

  @Post('insight/brand/contents/:id/irrelevant')
  markIrrelevant(@Param('id', ParseIntPipe) id: number) {
    return this.insightService.markIrrelevant(id);
  }

  @Get('insight/brand/reports')
  reports() {
    return this.insightService.reports();
  }

  @Post('insight/brand/reports')
  createReport(
    @Body() dto: { name: string; period?: string; access?: string },
    @Req() req: Request,
  ) {
    const user = req.user as { id: number };
    return this.insightService.createReport(dto, user.id);
  }

  @Delete('insight/brand/reports/:id')
  deleteReport(@Param('id', ParseIntPipe) id: number) {
    return this.insightService.deleteReport(id);
  }
}
