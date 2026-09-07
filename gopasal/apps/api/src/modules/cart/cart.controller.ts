import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { CartService } from './cart.service';
import { AddToCartDto, SetQtyDto } from './dto/cart.dto';

/** Customer cart. Requires auth (cart is bound to the user, not a session cookie). */
@ApiTags('cart')
@ApiBearerAuth()
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Get my cart with live prices and totals' })
  get(@CurrentUser('id') userId: string) {
    return this.cart.get(userId);
  }

  @Post('items')
  @ApiOperation({ summary: 'Add an item (switching shop clears the cart)' })
  add(@CurrentUser('id') userId: string, @Body() dto: AddToCartDto) {
    return this.cart.addItem(userId, dto);
  }

  @Patch('items/:itemId')
  @ApiOperation({ summary: 'Set item quantity (0 removes it)' })
  setQty(@CurrentUser('id') userId: string, @Param('itemId') itemId: string, @Body() dto: SetQtyDto) {
    return this.cart.setQty(userId, itemId, dto.qty);
  }

  @Delete('items/:itemId')
  remove(@CurrentUser('id') userId: string, @Param('itemId') itemId: string) {
    return this.cart.removeItem(userId, itemId);
  }

  @Delete()
  @ApiOperation({ summary: 'Empty the cart' })
  clear(@CurrentUser('id') userId: string) {
    return this.cart.clear(userId);
  }
}
