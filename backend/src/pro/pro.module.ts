import { Module } from '@nestjs/common';
import { ProController } from './pro.controller';
import { ProService } from './pro.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ProController],
  providers: [ProService],
})
export class ProModule {}
