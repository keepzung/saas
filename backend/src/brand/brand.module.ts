import { Module } from '@nestjs/common';
import { BrandController } from './brand.controller';
import { BrandMemberController } from './brand-member.controller';
import { BrandService } from './brand.service';

@Module({
  controllers: [BrandController, BrandMemberController],
  providers: [BrandService],
})
export class BrandModule {}
