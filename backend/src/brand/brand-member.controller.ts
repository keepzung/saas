import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BrandService } from './brand.service';

@Controller('brandMember')
@UseGuards(JwtAuthGuard)
export class BrandMemberController {
  constructor(private brandService: BrandService) {}

  @Get('myRole')
  myRole(@Req() req: Request, @Query('brandId') brandId?: string) {
    const user = req.user as { id: number };
    return this.brandService.myRoles(user.id, brandId ? Number(brandId) : undefined);
  }
}
