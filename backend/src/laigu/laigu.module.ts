import { Module } from '@nestjs/common';
import { ContentproModule } from '../contentpro/contentpro.module';
import { DmBotService } from './dm-bot.service';
import { LaiguApiClient } from './laigu-api.client';
import { LaiguController } from './laigu.controller';
import { LaiguService } from './laigu.service';

@Module({
  imports: [ContentproModule],
  controllers: [LaiguController],
  providers: [LaiguApiClient, LaiguService, DmBotService],
})
export class LaiguModule {}
