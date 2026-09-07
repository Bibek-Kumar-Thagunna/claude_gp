import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../rbac/require-permissions.decorator';
import { ReviewsService } from './reviews.service';
import { ListShopReviewsQueryDto, ReplyReviewDto } from './dto/reviews.dto';

/** Seller review management, shop-scoped. Sellers can read all reviews and post one public reply. */
@ApiTags('seller:reviews')
@ApiBearerAuth()
@Controller('seller/shops/:shopId/reviews')
export class ReviewsSellerController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @RequirePermissions('reviews.view')
  @ApiOperation({
    summary: 'One page of the shop reviews, with shop-wide counts',
    description:
      'Filters (q, answered, rating) narrow the page. `summary` always describes every review the shop has, so the tally cards stay true while the list is filtered.',
  })
  list(@Param('shopId') shopId: string, @Query() query: ListShopReviewsQueryDto) {
    return this.reviews.listForShopManage(shopId, query);
  }

  @Post(':reviewId/reply')
  @RequirePermissions('reviews.reply')
  @ApiOperation({ summary: 'Post a public reply to a customer review' })
  reply(@Param('shopId') shopId: string, @Param('reviewId') reviewId: string, @Body() dto: ReplyReviewDto) {
    return this.reviews.reply(shopId, reviewId, dto.reply);
  }
}
