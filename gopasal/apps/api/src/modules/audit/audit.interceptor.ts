import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import type { AuthedRequest } from '../../common/types/authed-request';
import { AUDIT_KEY, AuditMeta } from './audit.decorator';
import { AuditService } from './audit.service';

/**
 * Records an audit entry after any @Audit()-marked handler completes
 * successfully. Best-effort and non-blocking: it observes the response but the
 * actual write is fire-and-forget inside AuditService (which swallows errors).
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMeta | undefined>(AUDIT_KEY, context.getHandler());
    if (!meta || context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const actorId: string | undefined = req.user?.id;
    const forwarded = req.headers['x-forwarded-for'];
    const ip: string | undefined = req.ip ?? (typeof forwarded === 'string' ? forwarded : forwarded?.[0]);
    const params = req.params as Record<string, string> | undefined;
    const paramId = meta.idParam ? params?.[meta.idParam] : undefined;

    return next.handle().pipe(
      tap((result) => {
        void this.audit.record({
          actorId,
          action: meta.action,
          entityType: meta.entityType,
          entityId: paramId ?? this.idOf(result),
          ip,
          after: this.slim(result),
        });
      }),
    );
  }

  /** The id of a returned entity, when the handler returned one. */
  private idOf(result: unknown): string | undefined {
    if (!result || typeof result !== 'object') return undefined;
    const id = (result as Record<string, unknown>).id;
    return typeof id === 'string' ? id : undefined;
  }

  /** Keep the snapshot compact — audit is a trail, not a data lake. */
  private slim(result: unknown): unknown {
    if (!result || typeof result !== 'object') return result;
    const { id, status, code } = result as Record<string, unknown>;
    return { id, status, code };
  }
}
