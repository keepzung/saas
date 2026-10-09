import { Module } from '@nestjs/common';
import { KoxController } from './kox.controller';
import { KoxService } from './kox.service';
import { KosTierService } from './kos-tier.service';
import { ProMatrixService } from '../pro/pro-matrix.service';

@Module({
  controllers: [KoxController],
  providers: [KoxService, KosTierService, ProMatrixService],
})
export class KoxModule {}
