import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { PolicyModule } from '../policy/policy.module';
import { UploadsModule } from '../uploads/uploads.module';
import { DocumentsService } from './documents.service';
import { OnboardingAdminController } from './onboarding.admin.controller';
import { OnboardingSellerController } from './onboarding.seller.controller';
import { OnboardingService } from './onboarding.service';

/**
 * Seller onboarding: apply → review → approve, and the shop that only exists
 * because of it.
 *
 * `CatalogModule` is imported for `ShopsService.provisionApprovedShop` — the
 * approval path does not write `Shop` rows itself, it hands its transaction to
 * the service that owns that table. `PolicyModule` is imported so terms
 * acceptance at submit time is recorded through the same versioned-policy
 * machinery as every other consent, rather than a second copy of it.
 * `UploadsModule` provides the one service allowed to put bytes anywhere; the
 * KYC routes live here, next to the permission checks that guard them, rather
 * than on a generic upload controller with no owner.
 *
 * Notifications are not wired here: the module emits domain events and
 * `NotificationEventsListener` decides who hears what, which is where every
 * other fan-out in this codebase lives.
 */
@Module({
  imports: [CatalogModule, PolicyModule, UploadsModule],
  controllers: [OnboardingSellerController, OnboardingAdminController],
  providers: [OnboardingService, DocumentsService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
