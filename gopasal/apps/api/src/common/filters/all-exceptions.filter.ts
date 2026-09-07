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

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    // A plain number, not the HttpStatus enum: `getStatus()` returns any integer
    // a handler chose, and the >= 500 test below is a numeric range check rather
    // than a comparison against one named member.
    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'InternalServerError';
    let details: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body: unknown = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
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
        status = HttpStatus.BAD_REQUEST;
        message = 'Database request error.';
        error = 'BadRequest';
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
      this.logger.warn(`${req.method} ${req.url} → 400 (Prisma validation): ${exception.message}`);
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

    if (status >= 500) {
      // A server-side failure's internals are not the caller's business — the
      // same rule the pass-through above follows, applied to the message too.
      details = {};
      this.logger.error(
        `${req.method} ${req.url} → ${status}: ${describe(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    res.status(status).json({
      statusCode: status,
      error,
      message,
      ...this.passThrough(details),
      path: req.url,
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
