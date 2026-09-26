import { Module } from '@nestjs/common';
import { KoxController } from './kox.controller';
import { KoxService } from './kox.service';
import { KosTierService } from './kos-tier.service';

@Module({
  controllers: [KoxController],
  providers: [KoxService, KosTierService],
})
export class KoxModule {}
