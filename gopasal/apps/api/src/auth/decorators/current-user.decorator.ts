import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user';

/**
 * Injects the authenticated user (or one field of it):
 *   me(@CurrentUser() user: AuthUser)
 *   me(@CurrentUser('id') userId: string)
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = req.user;
    return field ? user?.[field] : user;
  },
);
