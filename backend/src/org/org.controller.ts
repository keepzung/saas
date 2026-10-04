import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgService } from './org.service';

@Controller('org')
@UseGuards(JwtAuthGuard)
export class OrgController {
  constructor(private service: OrgService) {}

  @Get('tree')
  tree(@Req() req: Request, @Query('brandId') brandId?: string) {
    const user = req.user as { id: number };
    return this.service.tree(user.id, Number(brandId ?? 1));
  }

  @Post()
  create(
    @Req() req: Request,
    @Body()
    dto: {
      brandId: number;
      name: string;
      level: number;
      parentId?: number;
      regionName?: string;
      cityName?: string;
    },
  ) {
    const user = req.user as { id: number };
    return this.service.create(user.id, dto);
  }

  @Put(':id')
  update(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    dto: {
      name?: string;
      level?: number;
      parentId?: number | null;
      regionName?: string | null;
      cityName?: string | null;
      sort?: number;
      status?: string;
    },
  ) {
    const user = req.user as { id: number };
    return this.service.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = req.user as { id: number };
    return this.service.remove(user.id, id);
  }
}
