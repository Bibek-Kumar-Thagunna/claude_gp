import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * Audit logging is cross-cutting, so the service is global. The interceptor is
 * applied per-controller (admin, rbac) rather than globally to keep the trail
 * focused on sensitive mutations.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
