import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit:meta';

export interface AuditMeta {
  action: string;
  entityType: string;
  /** name of the route param holding the entity id, e.g. 'shopId' */
  idParam?: string;
}

/**
 * Marks a mutating handler for automatic audit logging. The interceptor records
 * an entry after the handler succeeds, capturing actor, action and entity id.
 */
export const Audit = (action: string, entityType: string, idParam?: string) =>
  SetMetadata<string, AuditMeta>(AUDIT_KEY, { action, entityType, idParam });
