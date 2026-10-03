import { Module } from '@nestjs/common';
import { SupportService } from './support.service';
import { DisputesService } from './disputes.service';
import { SupportController } from './support.controller';
import { SupportAdminController } from './support.admin.controller';
import { SupportAssistantService } from './support-assistant.service';
import { UploadsModule } from '../uploads/uploads.module';

/**
 * Customer support tickets + order disputes. Customer surface on /support,
 * platform-staff surface on /admin/support (audit-logged).
 */
@Module({
  imports: [UploadsModule],
  controllers: [SupportController, SupportAdminController],
  providers: [SupportService, DisputesService, SupportAssistantService],
  exports: [SupportService, DisputesService, SupportAssistantService],
})
export class SupportModule {}
