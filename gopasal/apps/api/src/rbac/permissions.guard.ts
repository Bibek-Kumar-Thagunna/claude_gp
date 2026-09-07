import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthUser } from '../common/types/auth-user';
import {
  PERMISSIONS_KEY,
  PERMISSIONS_MODE_KEY,
  type PermissionMode,
} from './require-permissions.decorator';
import { RbacService } from './rbac.service';

/**
 * Enforces @RequirePermissions / @RequireAnyPermission. Default-deny:
 *  - no authenticated user            → 401
 *  - SHOP-scoped key with no shop ctx → 403
 *  - missing grant                    → 403
 *  - shop not approved / suspended    → 403 with the reason in words
 * Runs AFTER JwtAuthGuard (which populates req.user). Loads the caller's RBAC
 * context once and evaluates every required key against it.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true; // route is open to any authed user

    const mode =
      this.reflector.getAllAndOverride<PermissionMode>(PERMISSIONS_MODE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'all';

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    if (!user) throw new UnauthorizedException('Authentication required');

    const shopId = this.resolveShopId(req);
    const ctx = await this.rbac.loadContext(user.id);

    const verdicts = required.map((key) => ({
      key,
      ...this.rbac.contextExplain(ctx, key, shopId),
    }));
    const ok = mode === 'any' ? verdicts.some((v) => v.allowed) : verdicts.every((v) => v.allowed);

    if (!ok) {
      const denied = verdicts.filter((v) => !v.allowed);
      // A shop-lifecycle refusal is not the same failure as a missing grant, and
      // telling a shopkeeper "Missing permission: orders.accept" when the real
      // answer is "your application is still being reviewed" is a support ticket
      // waiting to happen. Prefer the explained reason when there is one.
      const explained = denied.find((v) => v.reason);
      if (explained?.reason) throw new ForbiddenException(explained.reason);

      const missing = denied.map((v) => v.key);
      throw new ForbiddenException(
        `Missing permission${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
      );
    }

    // The resolved shop id is deliberately NOT stashed on the request. It used to be
    // (`(req as AuthedRequest).shopId = shopId`), for an `@ActiveShop()` decorator to
    // read back, and nothing ever read it: every shop-scoped route takes `:shopId` in
    // its path, which is the same value this guard checked the grant against, so a
    // handler that reads its own parameter cannot disagree with the guard about which
    // shop was authorised. A second copy on the request could.
    return true;
  }

  /**
   * Which shop this request is about, for the SHOP-scoped keys.
   *
   * Four sources, path parameter first, because that is the one every shop-scoped
   * controller actually uses. The other three are not a trust decision: whatever a
   * caller claims here is the shop the grant is then evaluated *against*, so naming
   * someone else's shop produces a 403 rather than access to it.
   */
  private resolveShopId(req: Request): string | undefined {
    const fromParam = (req.params as Record<string, string> | undefined)?.shopId;
    const fromHeader = req.headers['x-shop-id'];
    const fromQuery = (req.query as Record<string, unknown> | undefined)?.shopId;
    const fromBody = (req.body as Record<string, unknown> | undefined)?.shopId;
    return (
      fromParam ||
      (typeof fromHeader === 'string' ? fromHeader : undefined) ||
      (typeof fromQuery === 'string' ? fromQuery : undefined) ||
      (typeof fromBody === 'string' ? fromBody : undefined)
    );
  }
}
