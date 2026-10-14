import { Module } from '@nestjs/common';
import { KoxController } from './kox.controller';
import { MddSalesController } from './mdd-sales.controller';
import { KoxService } from './kox.service';
import { KosTierService } from './kos-tier.service';
import { ProMatrixService } from '../pro/pro-matrix.service';

@Module({
  controllers: [KoxController, MddSalesController],
  providers: [KoxService, KosTierService, ProMatrixService],
})
export class KoxModule {}
