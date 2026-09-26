import { Module } from '@nestjs/common';
import { PartnerApiClient } from './partner-api.client';
import { SparkApiClient } from './spark-api.client';
import { SparkOrgRegistry } from './spark-org.registry';
import { SparkController } from './spark.controller';
import { SparkService } from './spark.service';

@Module({
  controllers: [SparkController],
  providers: [PartnerApiClient, SparkApiClient, SparkOrgRegistry, SparkService],
})
export class SparkModule {}
