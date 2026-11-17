import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReportService } from './report.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class ReportController {
  constructor(private service: ReportService) {}

  @Get('report/list')
  list(
    @Query('brandId') brandId?: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('page_size') pageSize?: string,
  ) {
    return this.service.list(Number(brandId ?? 1), { type, page, pageSize });
  }

  @Get('report/:id')
  detail(@Param('id', ParseIntPipe) id: number, @Query('brandId') brandId?: string) {
    return this.service.detail(Number(brandId ?? 1), id);
  }
}
