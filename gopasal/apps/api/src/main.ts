import 'reflect-metadata';
import { Logger, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { ServerResponse } from 'node:http';
import { AppModule } from './app.module';
import type { AppConfig } from './config/configuration';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RequestValidationPipe } from './common/pipes/request-validation.pipe';
import { SanitizeInterceptor } from './common/interceptors/sanitize.interceptor';
import { MAP_PROVIDER, type MapProvider } from './providers/map.provider';
import { PUSH_PROVIDER, type PushProvider } from './providers/push.provider';
import { LocalStorageProvider, STORAGE_PROVIDER, type StorageProvider } from './providers/storage.provider';
import { SMS_PROVIDER, type SmsProvider } from './auth/sms.provider';
import {
  SUPPORT_ASSISTANT_PROVIDER,
  type SupportAssistantProvider,
} from './providers/support-assistant.provider';
import { MALWARE_SCANNER, type MalwareScanner } from './providers/malware-scanner.provider';
import { configureRealtimeOrigins } from './realtime/ws-auth';

// PostGIS / $queryRaw counts arrive as BigInt — make them JSON-safe globally.
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function () {
  return Number(this);
};

async function bootstrap(): Promise<void> {
  // Configuration is validated inside AppModule (ConfigModule's `validate` hook),
  // which runs before any provider factory — so a missing credential is reported
  // as a named variable rather than as a DI failure. Nothing to re-check here.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService<AppConfig, true>);

  const apiPrefix = config.get('apiPrefix', { infer: true });
  const corsOrigins = config.get('corsOrigins', { infer: true });
  const port = config.get('port', { infer: true });
  const trustProxy = config.get('trustProxy', { infer: true });

  app.set('trust proxy', trustProxy);
  configureRealtimeOrigins(corsOrigins);
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    // `Idempotency-Key` belongs here or the feature is native-only: a browser
    // sending it triggers a preflight, and a header missing from this list fails
    // that preflight outright — so the request never leaves the page. The phone
    // apps are unaffected (no origin, no preflight), which is exactly how a gap
    // like this stays hidden until a web console tries to place an order safely.
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Shop-Id',
      'Idempotency-Key',
      'X-GoPasal-Auth-Mode',
      'X-GoPasal-Auth-Surface',
    ],
  });

  app.setGlobalPrefix(apiPrefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Local storage is only genuinely usable if the files come back out again.
  // `LocalStorageProvider.publicUrl()` promises /uploads/public/<key>; this is the
  // handler that keeps that promise. Registered outside the API prefix and after
  // the prefix is set, so URLs stay stable when API_PREFIX changes. With
  // STORAGE_PROVIDER=s3 nothing is served from this instance at all.
  //
  // The mount is rooted at `publicDirectory` — <root>/public — and NOT at the
  // storage root. That is deliberate and is the outermost of the three defences
  // around private objects: KYC scans live under <root>/private, which is simply
  // not inside the served tree, so there is no path a request can take to reach
  // them even if a storage key leaks. They are readable only through the
  // authenticated download endpoint, which checks who is asking.
  const storage = app.get<StorageProvider>(STORAGE_PROVIDER);
  if (storage instanceof LocalStorageProvider) {
    app.useStaticAssets(storage.publicDirectory, {
      prefix: '/uploads/public/',
      index: false,
      redirect: false,
      // Uploaded files are user content: never let the browser guess and run it.
      setHeaders: (res: ServerResponse) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      },
    });
  }

  // Validation is global and mandatory. See `RequestValidationPipe` for why body
  // and query are not given the same transform options.
  app.useGlobalPipes(new RequestValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new SanitizeInterceptor());

  // Shutdown is owned here, explicitly. See `installShutdown` for why
  // `enableShutdownHooks()` on its own is not enough.
  installShutdown(app);

  // The OpenAPI document is a complete description of this API: every route, every
  // DTO property, every validation constraint. That is exactly what a console
  // developer wants and exactly what nobody outside the team should be handed, so
  // it is mounted only when `docsEnabled` — which defaults to "not in production".
  // `createDocument` walks every controller and builds every schema, so skipping
  // the whole block also skips that work on a production boot.
  const docsEnabled = config.get('docsEnabled', { infer: true });
  if (docsEnabled) {
    const swagger = new DocumentBuilder()
      .setTitle('GoPasal API')
      .setDescription('Hyperlocal commerce platform for Nepal — customer, seller & admin surfaces.')
      .setVersion('1.0')
      .addBearerAuth()
      .addGlobalParameters({
        name: 'X-Shop-Id',
        in: 'header',
        required: false,
        description: 'Active shop context for SHOP-scoped requests.',
      })
      .build();
    const doc = SwaggerModule.createDocument(app, swagger);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, doc, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen(port);

  // Say which implementation of each external service is actually live. A
  // deployment should never have to guess whether it is sending real SMS.
  const sms = app.get<SmsProvider>(SMS_PROVIDER);
  const maps = app.get<MapProvider>(MAP_PROVIDER);
  const push = app.get<PushProvider>(PUSH_PROVIDER);
  const supportAssistant = app.get<SupportAssistantProvider>(SUPPORT_ASSISTANT_PROVIDER);
  const malwareScanner = app.get<MalwareScanner>(MALWARE_SCANNER);
  const logger = new Logger('Bootstrap');
  logger.log(
    `providers → sms=${sms.name}${sms.delivers ? '' : ' (not delivered)'} storage=${storage.name} ` +
      `maps=${maps.name} push=${push.name}${push.delivers ? '' : ' (not delivered)'} ` +
      `supportAssistant=${supportAssistant.name} malwareScanner=${malwareScanner.name}`,
  );
  logger.log(
    `GoPasal API ready → ${config.get('publicUrl', { infer: true })}/${apiPrefix}` +
      `${docsEnabled ? ` (docs at /${apiPrefix}/docs)` : ' (docs disabled)'}`,
  );
}

/** How long the whole close sequence may take before we stop waiting for it. */
const SHUTDOWN_GRACE_MS = 8_000;

/**
 * Exit on SIGINT/SIGTERM — always, and within a bounded time.
 *
 * The API used to ignore SIGINT and have to be SIGKILLed. Two things caused that,
 * and both were in our own bootstrap:
 *
 * - `app.enableShutdownHooks()` only *starts* the close. It runs the lifecycle
 *   hooks and then leaves the process to end by itself, which happens only once
 *   the last libuv handle is released — so anything still holding one turns
 *   "stopped" into "hung".
 * - Worse, `PrismaService.enableShutdownHooks()` called `app.close()` from a
 *   `beforeExit` listener. `beforeExit` fires *whenever* the loop drains and is
 *   re-emitted if the handler schedules asynchronous work — which `app.close()`
 *   always does. That is a loop with no exit: drain → close → drain → close.
 *   Measured directly: an async `beforeExit` handler was still being re-emitted
 *   after 200 rounds. That listener is gone; Prisma now disconnects from
 *   `onModuleDestroy` like every other resource, and shutdown runs in one
 *   direction only — signal → `app.close()` → hooks → exit.
 *
 * So the sequence is owned here, bounded, and ends in an explicit exit. A watchdog
 * that says what it is doing and exits anyway is honest about a stuck hook while
 * still leaving something restartable; a process that never exits is neither.
 */
function installShutdown(app: NestExpressApplication): void {
  const logger = new Logger('Shutdown');
  // Already an http.Server: NestExpressApplication types it for us.
  const server = app.getHttpServer();
  let closing = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (closing) {
      logger.warn(`${signal} received again — already closing`);
      return;
    }
    closing = true;
    logger.log(`${signal} received — closing`);

    const watchdog = setTimeout(() => {
      logger.error(`close did not finish within ${SHUTDOWN_GRACE_MS}ms — exiting anyway`);
      process.exit(0);
    }, SHUTDOWN_GRACE_MS);
    // The watchdog itself must not be the handle that keeps the process alive.
    watchdog.unref();

    // Belt and braces. Node ≥19 already drops idle keep-alive connections inside
    // `close()` (measured: a pooled idle socket did not delay it at all), but on
    // an older runtime an idle client socket does hold the server open, and a
    // shutdown path is the wrong place to depend on the runtime version.
    server.closeIdleConnections?.();

    try {
      await app.close();
      logger.log('closed cleanly');
    } catch (err) {
      logger.error(`close failed: ${(err as Error).message}`);
    } finally {
      clearTimeout(watchdog);
      process.exit(0);
    }
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => void shutdown(signal));
  }
}

bootstrap().catch((err: Error) => {
  // A configuration problem is a message, not a stack trace: printing 40 frames
  // of Nest internals above "SPARROW_SMS_TOKEN is missing" buries the one line
  // that matters.
  // eslint-disable-next-line no-console
  console.error(`\n${err.message}\n`);
  process.exit(1);
});
