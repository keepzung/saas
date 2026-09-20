import { Module } from '@nestjs/common';
import { SparkApiClient } from './spark-api.client';
import { SparkController } from './spark.controller';
import { SparkService } from './spark.service';

@Module({
  controllers: [SparkController],
  providers: [SparkApiClient, SparkService],
})
export class SparkModule {}
