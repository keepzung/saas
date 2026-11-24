import { Module } from '@nestjs/common';
import { BrandController } from './brand.controller';
import { BrandMemberController } from './brand-member.controller';
import { BrandService } from './brand.service';
import { BrandProfilesService } from './brand-profiles.service';

@Module({
  controllers: [BrandController, BrandMemberController],
  providers: [BrandService, BrandProfilesService],
  exports: [BrandProfilesService],
})
export class BrandModule {}
