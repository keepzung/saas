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
import { CrmService } from './crm.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class CrmController {
  constructor(private crmService: CrmService) {}

  @Get('crm/customers')
  customers(
    @Query()
    query: {
      page?: string;
      page_size?: string;
      keyword?: string;
      level?: string;
      followStatus?: string;
    },
  ) {
    return this.crmService.customers(query);
  }

  @Post('crm/customers')
  createCustomer(@Body() dto: Record<string, unknown>, @Req() req: Request) {
    const user = req.user as { id: number };
    return this.crmService.createCustomer(dto as never, user.id);
  }

  @Put('crm/customers/:id')
  updateCustomer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.crmService.updateCustomer(id, dto as never);
  }

  @Delete('crm/customers/:id')
  deleteCustomer(@Param('id', ParseIntPipe) id: number) {
    return this.crmService.deleteCustomer(id);
  }

  @Get('crm/orders')
  orders(
    @Query()
    query: { page?: string; page_size?: string; keyword?: string; payStatus?: string },
  ) {
    return this.crmService.orders(query);
  }

  @Post('crm/orders')
  createOrder(@Body() dto: Record<string, unknown>, @Req() req: Request) {
    const user = req.user as { id: number };
    return this.crmService.createOrder(dto as never, user.id);
  }

  @Put('crm/orders/:id/pay-status')
  updateOrderPayStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { payStatus: string },
  ) {
    return this.crmService.updateOrderPayStatus(id, dto.payStatus);
  }

  @Delete('crm/orders/:id')
  deleteOrder(@Param('id', ParseIntPipe) id: number) {
    return this.crmService.deleteOrder(id);
  }
}
