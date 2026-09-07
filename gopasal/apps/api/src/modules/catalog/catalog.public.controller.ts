import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CategoriesService } from './categories.service';
import { ProductsService } from './products.service';
import { ShopsService } from './shops.service';

/** Everything a shopper can browse without logging in. */
@ApiTags('storefront')
@Public()
@Controller()
export class CatalogPublicController {
  constructor(
    private readonly categories: CategoriesService,
    private readonly shops: ShopsService,
    private readonly products: ProductsService,
  ) {}

  @Get('categories')
  listCategories() {
    return this.categories.list();
  }

  @Get('categories/:slug')
  getCategory(@Param('slug') slug: string) {
    return this.categories.get(slug);
  }

  @Get('shops')
  listShops(@Query() pagination: PaginationDto, @Query('categoryId') categoryId?: string) {
    return this.shops.listPublic(pagination, categoryId);
  }

  @Get('shops/:slug')
  getShop(@Param('slug') slug: string) {
    return this.shops.getBySlug(slug);
  }

  @Get('shops/:slug/products')
  async listShopProducts(
    @Param('slug') slug: string,
    @Query() pagination: PaginationDto,
    @Query('categoryId') categoryId?: string,
  ) {
    const shop = await this.shops.getBySlug(slug);
    return this.products.listByShop(shop.id, pagination, categoryId);
  }

  @Get('products/:id')
  getProduct(@Param('id') id: string) {
    return this.products.get(id);
  }
}
