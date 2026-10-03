import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { CatalogImportService } from './catalog-import.service';
import { CatalogPublicController } from './catalog.public.controller';
import { CatalogSellerController } from './catalog.seller.controller';
import { CategoriesService } from './categories.service';
import { ProductsService } from './products.service';
import { ShopsService } from './shops.service';

@Module({
  // UploadsModule for the product-photo routes on the seller controller. The
  // storage provider itself arrives via the @Global ProvidersModule.
  imports: [UploadsModule],
  controllers: [CatalogPublicController, CatalogSellerController],
  providers: [CategoriesService, ShopsService, ProductsService, CatalogImportService],
  exports: [CategoriesService, ShopsService, ProductsService, CatalogImportService],
})
export class CatalogModule {}
