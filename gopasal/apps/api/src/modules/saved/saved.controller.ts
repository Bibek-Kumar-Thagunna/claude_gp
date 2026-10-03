import { Controller, Delete, Get, Param, Put, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { SavedProductParamsDto, SavedShopParamsDto } from "./dto/saved.dto";
import { SavedService } from "./saved.service";

@ApiTags("saved")
@ApiBearerAuth()
@Controller("saved")
export class SavedController {
  constructor(private readonly saved: SavedService) {}

  @Get("ids")
  @ApiOperation({ summary: "Get saved IDs for storefront controls" })
  ids(@CurrentUser("id") userId: string) {
    return this.saved.ids(userId);
  }

  @Get("shops")
  @ApiOperation({ summary: "List saved shops with current availability" })
  shops(@CurrentUser("id") userId: string, @Query() query: PaginationDto) {
    return this.saved.listShops(userId, query);
  }

  @Get("products")
  @ApiOperation({ summary: "List saved products with current availability" })
  products(@CurrentUser("id") userId: string, @Query() query: PaginationDto) {
    return this.saved.listProducts(userId, query);
  }

  @Put("shops/:shopId")
  @ApiOperation({ summary: "Save a currently discoverable shop" })
  saveShop(@CurrentUser("id") userId: string, @Param() params: SavedShopParamsDto) {
    return this.saved.saveShop(userId, params.shopId);
  }

  @Delete("shops/:shopId")
  @ApiOperation({ summary: "Remove a shop from this account’s saved list" })
  removeShop(@CurrentUser("id") userId: string, @Param() params: SavedShopParamsDto) {
    return this.saved.removeShop(userId, params.shopId);
  }

  @Put("products/:productId")
  @ApiOperation({ summary: "Save a currently orderable product" })
  saveProduct(@CurrentUser("id") userId: string, @Param() params: SavedProductParamsDto) {
    return this.saved.saveProduct(userId, params.productId);
  }

  @Delete("products/:productId")
  @ApiOperation({ summary: "Remove a product from this account’s saved list" })
  removeProduct(@CurrentUser("id") userId: string, @Param() params: SavedProductParamsDto) {
    return this.saved.removeProduct(userId, params.productId);
  }
}
