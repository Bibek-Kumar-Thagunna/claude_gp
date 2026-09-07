import { SetMetadata } from '@nestjs/common';

/** Marks a route as reachable without authentication. */
export const IS_PUBLIC_KEY = 'gp:public';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
