/**
 * The authenticated principal attached to `req.user` by the JWT strategy.
 * Kept deliberately small — anything role/permission related is resolved
 * on demand by the RBAC layer, never trusted from the token.
 */
export interface AuthUser {
  id: string;
  phone: string;
  isPlatformStaff: boolean;
}
