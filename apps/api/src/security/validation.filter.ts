import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ZodError } from 'zod';

/**
 * Turns a schema rejection into a readable 400.
 *
 * Controllers validate their bodies with `Schema.parse`, which throws `ZodError`.
 * Without this filter every malformed request surfaced as a 500 — which tells the
 * caller nothing about what was wrong with their request, and makes a client mistake
 * indistinguishable from a server fault in monitoring.
 *
 * Only the field path and Zod's own message are returned. Received values are
 * deliberately not echoed: a rejected body can contain a credential, and reflecting it
 * back would write it into the caller's logs.
 */
@Catch(ZodError)
export class ValidationExceptionFilter implements ExceptionFilter<ZodError> {
  catch(exception: ZodError, host: ArgumentsHost) {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    void reply.status(400).send({
      status: 'INVALID',
      message: 'The request did not match the expected shape.',
      issues: exception.issues.map((issue) => ({
        field: issue.path.length > 0 ? issue.path.join('.') : '(body)',
        message: issue.message,
      })),
    });
  }
}
