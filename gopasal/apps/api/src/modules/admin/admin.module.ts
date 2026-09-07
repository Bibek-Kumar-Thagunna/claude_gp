import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { FraudService } from './fraud.service';
import { AdminController } from './admin.controller';
import { FraudController } from './fraud.controller';

/**
 * Platform admin operations. AuditService is global (from AuditModule); Prisma
 * is global. Support/disputes and policy have their own admin controllers in
 * their respective feature modules.
 */
@Module({
  controllers: [AdminController, FraudController],
  providers: [AdminService, FraudService],
  exports: [AdminService, FraudService],
})
export class AdminModule {}
