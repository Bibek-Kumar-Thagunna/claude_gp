import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { ANALYTICS_PERIODS, type AnalyticsPeriod } from '../analytics-window';

/**
 * The only query parameter these endpoints take.
 *
 * `ValidationPipe` runs with `forbidNonWhitelisted`, so any other key is a 400 —
 * which is deliberate here: a console that asked for `?period=1y` or `?from=…`
 * should be told plainly that the window is one of three fixed choices rather than
 * be handed a silently substituted default.
 *
 * The default is `7d` because that is the question a shopkeeper opens the console
 * with, and because it is the cheapest window to compute.
 */
export class AnalyticsQueryDto {
  @ApiPropertyOptional({ enum: ANALYTICS_PERIODS, default: '7d' })
  @IsOptional()
  @IsIn(ANALYTICS_PERIODS)
  period: AnalyticsPeriod = '7d';
}
