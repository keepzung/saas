import { Module } from '@nestjs/common';
import { LaiguApiClient } from './laigu-api.client';
import { LaiguController } from './laigu.controller';
import { LaiguService } from './laigu.service';

@Module({
  controllers: [LaiguController],
  providers: [LaiguApiClient, LaiguService],
})
export class LaiguModule {}
