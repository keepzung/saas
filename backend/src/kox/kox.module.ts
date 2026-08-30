import { Module } from '@nestjs/common';
import { KoxController } from './kox.controller';
import { KoxService } from './kox.service';

@Module({
  controllers: [KoxController],
  providers: [KoxService],
})
export class KoxModule {}
