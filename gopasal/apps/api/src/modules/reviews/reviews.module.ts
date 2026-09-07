import { Module } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';
import { ReviewsSellerController } from './reviews.seller.controller';

@Module({
  controllers: [ReviewsController, ReviewsSellerController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
