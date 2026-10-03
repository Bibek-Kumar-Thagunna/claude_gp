import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { sanitize } from '../interceptors/sanitize.interceptor';

/**
 * Uniform error envelope for the whole API:
 *   { statusCode, message, error, path, timestamp }
 * Also maps common Prisma errors to sensible HTTP codes so clients never see
 * raw database errors.
 *
 * **Machine-readable detail survives.** A handler that throws
 * `new BadRequestException({ message, missing, missingDocuments })` means those
 * extra fields for the client: they are what lets the seller wizard highlight
 * the two empty fields and name the missing citizenship scan instead of showing
 * one flat sentence. Earlier this filter rebuilt the body from `message` alone
 * and silently dropped everything else, so the detail existed in the service,
 * was asserted by unit tests against `getResponse()`, and never reached the
 * wire. Anything on the exception body that is not one of our own envelope keys
 * is now copied onto the response — but only below 500, because a server-side
 * failure's internals are not the caller's business, and only after
 * `sanitize()`, since these fields never pass through SanitizeInterceptor
 * (interceptors do not run on the error path).
 */
const ENVELOPE_KEYS = new Set(['statusCode', 'error', 'message', 'path', 'timestamp']);

/**
 * The `error` label for a status, matching the words Nest puts in the same
 * field when it builds the body itself — so a client cannot tell whether the
 * handler threw with a string or an object. Anything unlisted falls back to the
 * exception's own class name, which is still honest and still not "Internal
 * Server Error".
 */
const REASON_PHRASE: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  410: 'Gone',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

function reasonPhrase(status: number, fallback: string): string {
  return REASON_PHRASE[status] ?? fallback;
}

/**
 * Whatever was thrown, as one line for the server log.
 *
 * `exception.stack` is passed to the logger separately, but a throw is not
 * always an `Error` — a rejected promise can carry a string, a number or a
 * plain object, and for those the stack is `undefined` and nothing at all would
 * be recorded. This is log-only: none of it is returned to the caller.
 */
function describe(exception: unknown): string {
  if (exception instanceof Error) return `${exception.name}: ${exception.message}`;
  if (typeof exception === 'object' && exception !== null) {
    try {
      return JSON.stringify(exception);
    } catch {
      return Object.prototype.toString.call(exception);
    }
  }
  return String(exception);
}

/**
 * Bearer credentials occasionally have to travel in a path (an invitation link
 * and the phone-only location capture link). Request URLs are echoed in the
 * error envelope and written to logs, so redact those segments before either
 * happens. Ordinary record ids remain visible for operations/debugging.
 */
export function redactRequestUrl(url: string): string {
  return url
    .replace(
      /(\/invites\/)(?!mine(?:\/|$)|accept(?:\/|$))[^/?#]+/g,
      '$1[REDACTED]',
    )
    .replace(/(\/public\/location-captures\/)[^/?#]+/g, '$1[REDACTED]')
    .replace(/(\/notifications\/devices\/)[^/?#]+/g, '$1[REDACTED]');
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const safeUrl = redactRequestUrl(req.url);

    // A plain number, not the HttpStatus enum: `getStatus()` returns any integer
    // a handler chose, and the >= 500 test below is a numeric range check rather
    // than a comparison against one named member.
    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'InternalServerError';
    let details: Record<string, unknown> = {};
    // Set by the branches that write their own, richer log line, so the
    // catch-all 4xx logger at the end does not repeat them.
    let logged = false;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body: unknown = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        // `error` must describe the status, not the field's initial value.
        // Nest builds an object body for `new BadRequestException('text')` and
        // fills `error` itself, but an exception thrown as
        // `new HttpException('text', status)` — which is what the OTP cooldown
        // and Nest's own ThrottlerException do — hands back a bare string, and
        // this branch never touched `error`. Every one of those answers went out
        // as `{"statusCode":429,"error":"InternalServerError"}`: a rate limit
        // reported to the caller, and to our own logs, as a server crash.
        error = reasonPhrase(status, exception.name);
      } else if (typeof body === 'object' && body) {
        // Nest's own validation pipe puts a string[] in `message`; everything
        // else puts a string. Read both shapes and ignore anything unexpected
        // rather than trusting the envelope blindly.
        const envelope = body as Record<string, unknown>;
        const rawMessage = envelope.message;
        if (typeof rawMessage === 'string') message = rawMessage;
        else if (Array.isArray(rawMessage))
          message = rawMessage.filter((m): m is string => typeof m === 'string');

        error = typeof envelope.error === 'string' ? envelope.error : exception.name;

        for (const [key, value] of Object.entries(envelope)) {
          if (!ENVELOPE_KEYS.has(key) && value !== undefined) details[key] = value;
        }
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        message = 'A record with these details already exists.';
        error = 'Conflict';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        message = 'Record not found.';
        error = 'NotFound';
      } else {
        // Every other Prisma code — P2021 (table missing), P2022 (column
        // missing), P2023 (inconsistent column data), P2010 (raw query failed)
        // — means the running database does not match the schema the client was
        // generated from, almost always because a migration has not been
        // applied. The caller gets the same flat 400 either way, and until now
        // nothing was written to the log for it: the branch below 500 does not
        // log, so an unmigrated column produced a silent "Database request
        // error." on every screen that touched it and no line anywhere saying
        // which column. The code and Prisma's own message are server-side
        // detail (they name tables and columns), so they go to the log only.
        status = HttpStatus.BAD_REQUEST;
        message = 'Database request error.';
        error = 'BadRequest';
        this.logger.error(
          `${req.method} ${safeUrl} \u2192 400 (Prisma ${exception.code}): ${exception.message}`,
        );
        logged = true;
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      // Not a `PrismaClientKnownRequestError` — it never reaches the database, so
      // it carries no `code` and the branch above cannot see it. Before this it
      // fell through to `instanceof Error`, which meant a 500 whose `message` was
      // Prisma's own multi-line report: the failing argument, the expected type
      // and a printed skeleton of the query, handed to the caller.
      //
      // It means the shape of `data`/`where` was wrong, which is a caller problem
      // wherever a request body reaches Prisma unfiltered — `{"name": null}` on a
      // non-nullable column was one real way in. The right answer is the 400 the
      // sibling branch already gives, with the details kept in the log. The DTO
      // fix in `UpdateShopDto` closes that particular route; this closes the
      // disclosure for every route that has not been audited yet.
      status = HttpStatus.BAD_REQUEST;
      message = 'Database request error.';
      error = 'BadRequest';
      this.logger.warn(`${req.method} ${safeUrl} → 400 (Prisma validation): ${exception.message}`);
      logged = true;
    }
    // No `else if (exception instanceof Error) { message = exception.message }`.
    // That branch used to exist, and it is how the internals of every unhandled
    // throw reached the browser: `PrismaClientInitializationError` is neither of
    // the two Prisma branches above, so its message — which names the database
    // host, port and role — landed here, as did every `TypeError` ("Cannot read
    // properties of undefined (reading 'shopId')"). The seller console renders
    // `error.message` verbatim on fourteen screens, so those strings were shown
    // to shopkeepers. An unrecognised throw keeps the `status`/`message`/`error`
    // this method opened with, and the real text goes to the log below.

    // Outside production, record every rejection the caller sees.
    //
    // A 4xx is a deliberate, already-sanitised answer, so unlike a 500 there is
    // nothing here to withhold from the log \u2014 and withholding it is what made
    // whole flows undebuggable: a rider tapping "on the way" and getting
    // "Delivery status changed; refresh before taking the next step", or an
    // invitation that silently 403s, left no trace at all on the server. The
    // developer watching `pnpm dev:api` now sees the same sentence the app
    // showed, next to the route that produced it. Production is excluded
    // because there a 4xx is ordinary traffic \u2014 a wrong OTP is not an incident,
    // and logging every one at volume buries the errors that matter.
    if (status >= 400 && status < 500 && !logged && process.env.APP_ENV !== 'production') {
      const text = Array.isArray(message) ? message.join('; ') : message;
      this.logger.warn(`${req.method} ${safeUrl} \u2192 ${status} ${error}: ${text}`);
    }

    if (status >= 500) {
      // A server-side failure's internals are not the caller's business — the
      // same rule the pass-through above follows, applied to the message too.
      details = {};
      this.logger.error(
        `${req.method} ${safeUrl} → ${status}: ${describe(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    res.status(status).json({
      statusCode: status,
      error,
      message,
      ...this.passThrough(details),
      path: safeUrl,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Redact secret-bearing keys (the same list the success path uses) and refuse
   * to emit anything `res.json` would then choke on — a throw inside `json()`
   * happens after the status line is chosen and would turn a clean 400 into a
   * broken socket.
   */
  private passThrough(details: Record<string, unknown>): Record<string, unknown> {
    if (Object.keys(details).length === 0) return {};
    try {
      const safe = sanitize(details) as Record<string, unknown>;
      JSON.stringify(safe);
      return safe;
    } catch {
      this.logger.warn('Dropped error detail that is not JSON-serialisable.');
      return {};
    }
  }
}
