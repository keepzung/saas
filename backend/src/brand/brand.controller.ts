import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BrandService } from './brand.service';

@Controller('brand')
@UseGuards(JwtAuthGuard)
export class BrandController {
  constructor(private brandService: BrandService) {}

  @Get('myList')
  myList(@Req() req: Request) {
    const user = req.user as { id: number };
    return this.brandService.myBrands(user.id);
  }
}
