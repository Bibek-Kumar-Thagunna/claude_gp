import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

type RoutedRequest = Request;

export function metricRoute(req: RoutedRequest): string {
  const rawRoute = (req as unknown as { route?: unknown }).route;
  const path =
    typeof rawRoute === 'object' && rawRoute !== null && 'path' in rawRoute
      ? (rawRoute as { path?: unknown }).path
      : undefined;
  if (typeof path !== 'string' || path.length === 0) return 'unmatched';
  // Express/Nest usually gives the full versioned template here. If an adapter
  // supplies a base URL separately, join once without ever using originalUrl
  // (which contains IDs and query strings and would create unbounded labels).
  const base = req.baseUrl && !path.startsWith(req.baseUrl) ? req.baseUrl : '';
  return `${base}${path}`.replace(/\/{2,}/g, '/');
}

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<RoutedRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    const started = process.hrtime.bigint();
    const finish = this.metrics.requestStarted(req.method);
    return next.handle().pipe(
      finalize(() => {
        finish();
        const route = metricRoute(req);
        // Readiness/liveness traffic would otherwise dominate the real customer
        // workload and make latency/error ratios look healthier than they are.
        if (/\/health(?:\/|$)/.test(route)) return;
        const seconds = Number(process.hrtime.bigint() - started) / 1_000_000_000;
        this.metrics.recordCompleted(req.method, route, res.statusCode, seconds);
      }),
    );
  }
}
