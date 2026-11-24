import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BrandService } from './brand.service';
import { BrandProfilesService } from './brand-profiles.service';

@Controller('brand')
@UseGuards(JwtAuthGuard)
export class BrandController {
  constructor(private brandService: BrandService, private brandProfiles: BrandProfilesService) {}

  @Get('myList')
  myList(@Req() req: Request) {
    const user = req.user as { id: number };
    return this.brandService.myBrands(user.id);
  }

  /** 品牌档案注册表(架构蓝图 v2 横切①;巡检/运维读取的唯一事实) */
  @Get('profiles')
  profiles() {
    return this.brandProfiles.listProfiles();
  }
}
