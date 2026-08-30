import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { AccessModule } from './access/access.module';
import { BrandModule } from './brand/brand.module';
import { StatsModule } from './stats/stats.module';
import { ProjectModule } from './project/project.module';
import { KolModule } from './kol/kol.module';
import { ContentModule } from './content/content.module';
import { KoxModule } from './kox/kox.module';
import { InsightModule } from './insight/insight.module';
import { CrmModule } from './crm/crm.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UserModule,
    AccessModule,
    BrandModule,
    StatsModule,
    ProjectModule,
    KolModule,
    ContentModule,
    KoxModule,
    InsightModule,
    CrmModule,
  ],
})
export class AppModule {}
