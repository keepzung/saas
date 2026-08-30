import {
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
import { KoxService } from './kox.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class KoxController {
  constructor(private koxService: KoxService) {}

  @Get('kox/accounts')
  accounts(
    @Query()
    query: { platform?: string; accountType?: string; status?: string; keyword?: string },
  ) {
    return this.koxService.accounts(query);
  }

  @Post('kox/accounts')
  createAccount(@Body() dto: { nickname: string } & Record<string, unknown>) {
    return this.koxService.createAccount(dto as never);
  }

  @Put('kox/accounts/:id')
  updateAccount(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.koxService.updateAccount(id, dto as never);
  }

  @Delete('kox/accounts/:id')
  deleteAccount(@Param('id', ParseIntPipe) id: number) {
    return this.koxService.deleteAccount(id);
  }

  @Get('kox/overview')
  overview(@Query() query: { start?: string; end?: string; platform?: string }) {
    return this.koxService.overview(query);
  }

  @Get('kox/tasks')
  tasks(@Query() query: { page?: string; page_size?: string; status?: string }) {
    return this.koxService.tasks(query);
  }

  @Post('kox/tasks')
  createTask(@Body() dto: Record<string, unknown>, @Req() req: Request) {
    const user = req.user as { id: number };
    return this.koxService.createTask(dto as never, user.id);
  }

  @Get('kox/tasks/:id')
  taskDetail(@Param('id', ParseIntPipe) id: number) {
    return this.koxService.taskDetail(id);
  }

  @Post('kox/tasks/:id/stop')
  stopTask(@Param('id', ParseIntPipe) id: number) {
    return this.koxService.stopTask(id);
  }

  @Get('kox/model-sales')
  modelSales(@Query() query: { month?: string }) {
    return this.koxService.modelSales(query);
  }
}
