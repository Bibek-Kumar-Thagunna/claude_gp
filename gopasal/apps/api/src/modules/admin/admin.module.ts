import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { FraudService } from './fraud.service';
import { AdminController } from './admin.controller';
import { FraudController } from './fraud.controller';
import { PlatformConfigController } from './platform-config.controller';
import { PlatformConfigService } from './platform-config.service';
import { PrivacyController } from './privacy.controller';
import { PrivacyService } from './privacy.service';

/**
 * Platform admin operations. AuditService is global (from AuditModule); Prisma
 * is global. Support/disputes and policy have their own admin controllers in
 * their respective feature modules.
 */
@Module({
  controllers: [AdminController, FraudController, PlatformConfigController, PrivacyController],
  providers: [AdminService, FraudService, PlatformConfigService, PrivacyService],
  exports: [AdminService, FraudService, PlatformConfigService, PrivacyService],
})
export class AdminModule {}
