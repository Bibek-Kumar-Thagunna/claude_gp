import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile as FilePart,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { MULTIPART_HARD_LIMIT_BYTES } from '../../config/configuration';
import { RequirePermissions } from '../../rbac/require-permissions.decorator';
import type { UploadedFile } from '../uploads/uploaded-file';
import {
  AdjustStockDto,
  CreateProductDto,
  ListShopProductsQueryDto,
  ReorderProductImagesDto,
  UpdateProductDto,
  UpdateShopDto,
  UpdateVariantDto,
  VariantDto,
} from './dto/catalog.dto';
import { PRODUCT_IMAGE_LIMIT } from './product-images';
import { ProductsService } from './products.service';
import { ShopsService } from './shops.service';

/** Seller surface. Every shop-scoped route resolves `:shopId` for the RBAC guard. */
@ApiTags('seller:catalog')
@ApiBearerAuth()
@Controller('seller')
export class CatalogSellerController {
  constructor(
    private readonly shops: ShopsService,
    private readonly products: ProductsService,
  ) {}

  // shops — a shop cannot be created here. It comes into existence when GoPasal
  // approves a ShopApplication (POST /seller/onboarding/…), which is what makes
  // KYC, terms acceptance and a human reviewer unskippable. There used to be a
  // `POST seller/shops` on this controller with no @RequirePermissions, which
  // let any authenticated caller mint a shop and an Owner membership for
  // themselves; it is gone deliberately — do not add it back.
  @Get('shops')
  myShops(@CurrentUser('id') userId: string) {
    return this.shops.mine(userId);
  }

  @Get('shops/:shopId')
  @RequirePermissions('dashboard.view')
  manageShop(@Param('shopId') shopId: string) {
    return this.shops.getForManage(shopId);
  }

  @Patch('shops/:shopId')
  @RequirePermissions('settings.manage')
  updateShop(@Param('shopId') shopId: string, @Body() dto: UpdateShopDto) {
    return this.shops.update(shopId, dto);
  }

  // products
  @Get('shops/:shopId/products')
  @RequirePermissions('catalog.view')
  @ApiOperation({
    summary: 'Product list — paged, searched and filtered server-side',
    description:
      'Returns `{ data, meta, summary }`. `meta` describes the page; `summary` counts the ' +
      'whole shop and ignores `q`/`status`/`stock`/`categoryId`, so narrowing the list does ' +
      'not change what the stat cards mean. Pass `categoryId=none` for uncategorised rows.',
  })
  listProducts(@Param('shopId') shopId: string, @Query() query: ListShopProductsQueryDto) {
    return this.products.listForShop(shopId, query);
  }

  @Post('shops/:shopId/products')
  @RequirePermissions('catalog.create')
  createProduct(@Param('shopId') shopId: string, @Body() dto: CreateProductDto) {
    return this.products.create(shopId, dto);
  }

  @Patch('shops/:shopId/products/:productId')
  @RequirePermissions('catalog.edit')
  updateProduct(
    @Param('shopId') shopId: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(shopId, productId, dto);
  }

  @Delete('shops/:shopId/products/:productId')
  @RequirePermissions('catalog.delete')
  deleteProduct(@Param('shopId') shopId: string, @Param('productId') productId: string) {
    return this.products.remove(shopId, productId);
  }

  @Post('shops/:shopId/products/:productId/stock')
  @RequirePermissions('inventory.adjust')
  adjustStock(
    @Param('shopId') shopId: string,
    @Param('productId') productId: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.products.adjustStock(shopId, productId, dto.delta);
  }

  // product photos
  //
  // Three routes, one column. `Product.images` holds storage keys the API minted;
  // no request body may name one — see `product-images.ts` for why the column is
  // keys rather than URLs, and `CreateProductDto` for what used to be here.
  /**
   * `multipart/form-data`, field name `file`. No other fields.
   *
   * The multer ceiling is the hard multipart bound rather than the configured
   * image limit, for the same reason as the KYC route: a decorator cannot read
   * `ConfigService`. `UploadsService` then applies the real image limit, and
   * `validateConfig` guarantees it is not above this one. `files: 1` stops a
   * request carrying a hundred parts named `file`.
   */
  @Post('shops/:shopId/products/:productId/images')
  @RequirePermissions('catalog.edit')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MULTIPART_HARD_LIMIT_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: `Add a product photo (JPEG, PNG or WebP; max ${PRODUCT_IMAGE_LIMIT} per product)`,
    description:
      'Returns the updated product. The file type is decided by reading the bytes, not by the ' +
      'name or the Content-Type sent, and the storage key is generated server-side — a client ' +
      'cannot choose where the object lands. The new photo goes last; use the reorder route to ' +
      'change which one is the product’s face.',
  })
  addProductImage(
    @Param('shopId') shopId: string,
    @Param('productId') productId: string,
    @FilePart() file: UploadedFile | undefined,
  ) {
    return this.products.addImage(shopId, productId, file);
  }

  /**
   * The key travels in the query string, not the path: a storage key contains
   * slashes, and a path parameter would either need encoding the client must not
   * get wrong or a wildcard route that accepts anything after the prefix.
   */
  @Delete('shops/:shopId/products/:productId/images')
  @RequirePermissions('catalog.edit')
  @ApiOperation({
    summary: 'Remove one product photo',
    description:
      'Takes the storage key as it appeared in the product’s `images` array. A key this product ' +
      'does not hold is a 400, whatever it names.',
  })
  removeProductImage(
    @Param('shopId') shopId: string,
    @Param('productId') productId: string,
    @Query('key') key: string,
  ) {
    return this.products.removeImage(shopId, productId, key);
  }

  @Put('shops/:shopId/products/:productId/images/order')
  @RequirePermissions('catalog.edit')
  @ApiOperation({
    summary: 'Reorder the product photos',
    description:
      'Send every key the product currently has, exactly once, in the desired order. A partial ' +
      'list is refused rather than treated as a delete — deleting has its own route, which also ' +
      'removes the stored object.',
  })
  reorderProductImages(
    @Param('shopId') shopId: string,
    @Param('productId') productId: string,
    @Body() dto: ReorderProductImagesDto,
  ) {
    return this.products.reorderImages(shopId, productId, dto.keys);
  }

  // variants
  @Post('shops/:shopId/products/:productId/variants')  @RequirePermissions('catalog.edit')
  addVariant(
    @Param('shopId') shopId: string,
    @Param('productId') productId: string,
    @Body() dto: VariantDto,
  ) {
    return this.products.addVariant(shopId, productId, dto);
  }

  @Patch('shops/:shopId/variants/:variantId')
  @RequirePermissions('catalog.edit')
  updateVariant(
    @Param('shopId') shopId: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.products.updateVariant(shopId, variantId, dto);
  }

  @Delete('shops/:shopId/variants/:variantId')
  @RequirePermissions('catalog.edit')
  deleteVariant(@Param('shopId') shopId: string, @Param('variantId') variantId: string) {
    return this.products.removeVariant(shopId, variantId);
  }
}
