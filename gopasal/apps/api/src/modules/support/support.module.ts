import { Module } from '@nestjs/common';
import { SupportService } from './support.service';
import { DisputesService } from './disputes.service';
import { SupportController } from './support.controller';
import { SupportAdminController } from './support.admin.controller';

/**
 * Customer support tickets + order disputes. Customer surface on /support,
 * platform-staff surface on /admin/support (audit-logged).
 */
@Module({
  controllers: [SupportController, SupportAdminController],
  providers: [SupportService, DisputesService],
  exports: [SupportService, DisputesService],
})
export class SupportModule {}
