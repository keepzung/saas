import { Module } from '@nestjs/common';
import { BrandModule } from '../brand/brand.module';
import { MccConnector } from '../ingest/connectors/mcc.connector';
import { PartnerApiClient } from './partner-api.client';
import { SparkApiClient } from './spark-api.client';
import { SparkOrgRegistry } from './spark-org.registry';
import { SparkController } from './spark.controller';
import { SparkService } from './spark.service';

@Module({
  imports: [BrandModule],
  controllers: [SparkController],
  // MccConnector(ingest 连接器,P4)暂挂本模块:只依赖 SparkApiClient,无模块环;
  // 后续 IngestModule 统一编排时再迁
  providers: [PartnerApiClient, SparkApiClient, SparkOrgRegistry, MccConnector, SparkService],
})
export class SparkModule {}
