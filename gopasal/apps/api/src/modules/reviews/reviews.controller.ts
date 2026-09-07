import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/reviews.dto';

/** Customer + public review surface. Writing needs auth; reading a shop's reviews is public. */
@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post('orders/:orderId/review')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Leave a review for a delivered order' })
  create(@CurrentUser('id') userId: string, @Param('orderId') orderId: string, @Body() dto: CreateReviewDto) {
    return this.reviews.createForOrder(userId, orderId, dto);
  }

  @Get('me/reviews')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reviews I have written' })
  mine(@CurrentUser('id') userId: string) {
    return this.reviews.listMine(userId);
  }

  @Get('shops/:shopId/reviews')
  @Public()
  @ApiOperation({ summary: 'Public reviews + rating summary for a shop' })
  forShop(@Param('shopId') shopId: string) {
    return this.reviews.listForShop(shopId);
  }
}
