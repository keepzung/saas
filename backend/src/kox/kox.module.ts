import { Module } from '@nestjs/common';
import { BrandModule } from '../brand/brand.module';
import { KoxController } from './kox.controller';
import { MddSalesController } from './mdd-sales.controller';
import { KoxService } from './kox.service';
import { KosTierService } from './kos-tier.service';
import { MddCategoryService } from './mdd-category.service';
import { ProMatrixService } from '../pro/pro-matrix.service';

@Module({
  imports: [BrandModule],
  controllers: [KoxController, MddSalesController],
  providers: [KoxService, KosTierService, MddCategoryService, ProMatrixService],
})
export class KoxModule {}
