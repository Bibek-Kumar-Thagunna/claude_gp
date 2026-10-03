import { Logger, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerModule } from "@nestjs/throttler";
import configuration, { validateConfig } from "./config/configuration";
import { PrismaModule } from "./common/prisma/prisma.module";
import { RedisModule } from "./common/redis/redis.module";
import { IdempotencyModule } from "./common/idempotency/idempotency.module";
import { HttpThrottlerGuard } from "./common/guards/http-throttler.guard";
import { ProvidersModule } from "./providers/providers.module";
import { RbacModule } from "./rbac/rbac.module";
import { PermissionsGuard } from "./rbac/permissions.guard";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/guards/jwt-auth.guard";
import { UsersModule } from "./modules/users/users.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { DiscoveryModule } from "./modules/discovery/discovery.module";
import { CartModule } from "./modules/cart/cart.module";
import { CouponsModule } from "./modules/coupons/coupons.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { DeliveryModule } from "./modules/delivery/delivery.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { ReviewsModule } from "./modules/reviews/reviews.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { AuditModule } from "./modules/audit/audit.module";
import { SupportModule } from "./modules/support/support.module";
import { EngagementModule } from "./modules/engagement/engagement.module";
import { GroupOrdersModule } from "./modules/group-orders/group-orders.module";
import { PolicyModule } from "./modules/policy/policy.module";
import { AdminModule } from "./modules/admin/admin.module";
import { InvitesModule } from "./modules/invites/invites.module";
import { OnboardingModule } from "./modules/onboarding/onboarding.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { LocationCaptureModule } from "./modules/location-capture/location-capture.module";
import { FinanceModule } from "./modules/finance/finance.module";
import { HealthController } from "./health.controller";
import { MessagingModule } from "./modules/messaging/messaging.module";
import { SavedModule } from "./modules/saved/saved.module";
import { MetricsModule } from "./common/metrics/metrics.module";

/**
 * Root module. Infrastructure (config, prisma, redis, providers, rbac) is global;
 * feature modules layer on top. Three global guards enforce, in order:
 * rate-limiting → authentication (JWT, unless @Public) → authorization (RBAC,
 * when @RequirePermissions is present). This makes the API default-deny.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      cache: true,
      /**
       * `validate` receives the merged .env + process.env map *after* dotenv has
       * parsed the file and *before* any provider is constructed — which is the
       * only place a missing credential can be reported as what it is (a named
       * configuration variable) rather than as a dependency-injection crash from
       * inside a provider factory. Warnings are printed once, here, at boot.
       */
      validate: (env: NodeJS.ProcessEnv) => {
        const report = validateConfig(configuration(env));
        const logger = new Logger("Config");
        for (const warning of report.warnings) logger.warn(warning);
        return env;
      },
    }),
    EventEmitterModule.forRoot({ global: true, wildcard: false, delimiter: "." }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    ScheduleModule.forRoot(),

    // infrastructure (all @Global)
    PrismaModule,
    RedisModule,
    IdempotencyModule,
    ProvidersModule,
    RbacModule,
    AuditModule,

    // features
    AuthModule,
    UsersModule,
    CatalogModule,
    DiscoveryModule,
    CartModule,
    CouponsModule,
    FinanceModule,
    OrdersModule,
    DeliveryModule,
    RealtimeModule,
    ReviewsModule,
    NotificationsModule,
    SupportModule,
    EngagementModule,
    GroupOrdersModule,
    PolicyModule,
    AdminModule,
    InvitesModule,
    OnboardingModule,
    AnalyticsModule,
    LocationCaptureModule,
    MessagingModule,
    SavedModule,
    MetricsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: HttpThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
