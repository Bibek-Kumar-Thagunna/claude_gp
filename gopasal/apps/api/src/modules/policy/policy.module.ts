import { Module } from '@nestjs/common';
import { PolicyService } from './policy.service';
import { PolicyController } from './policy.controller';
import { PolicyAdminController } from './policy.admin.controller';

/** Versioned legal/policy documents: public reading, acceptance, admin publishing. */
@Module({
  controllers: [PolicyController, PolicyAdminController],
  providers: [PolicyService],
  exports: [PolicyService],
})
export class PolicyModule {}
