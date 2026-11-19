import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Report, ReportSchema } from './schemas/report.schema';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { ModerationService } from './moderation.service';
import { BlogModule } from '../blog/blog.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { ItinerariesModule } from '../itineraries/itineraries.module';

@Module({
  imports: [BlogModule, ReviewsModule, ItinerariesModule, MongooseModule.forFeature([{ name: Report.name, schema: ReportSchema }])],
  controllers: [ReportsController],
  providers: [ReportsService, ModerationService],
  exports: [ReportsService, ModerationService],
})
export class ReportsModule {}
