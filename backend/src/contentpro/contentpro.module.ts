import { Module } from '@nestjs/common';
import { ContentproController } from './contentpro.controller';
import { ContentproService } from './contentpro.service';
import { AiService } from './ai.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ContentproController],
  providers: [ContentproService, AiService],
})
export class ContentproModule {}
