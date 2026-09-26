import { Module } from '@nestjs/common';
import { SparkApiClient } from './spark-api.client';
import { SparkOrgRegistry } from './spark-org.registry';
import { SparkController } from './spark.controller';
import { SparkService } from './spark.service';

@Module({
  controllers: [SparkController],
  providers: [SparkApiClient, SparkOrgRegistry, SparkService],
})
export class SparkModule {}
