import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { AcceptInviteDto } from './dto/invites.dto';
import { InvitesService } from './invites.service';

/**
 * The invitee's side of an invitation, shared by both consoles.
 *
 * `GET /invites/:token` is public on purpose — the join page has to be able to
 * say who invited you and which number to use *before* asking you to sign in.
 * It returns no secrets and masks the phone number, and it is rate-limited
 * because a public token lookup is the one enumerable surface here.
 */
@ApiTags('invites')
@Controller('invites')
export class InvitesPublicController {
  constructor(private readonly invites: InvitesService) {}

  @Get(':token')
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Preview an invitation link (no login required)' })
  preview(@Param('token') token: string) {
    return this.invites.preview(token);
  }

  @Get('mine/pending')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Invitations waiting for the signed-in phone number' })
  mine(@CurrentUser() user: AuthUser) {
    return this.invites.pendingFor(user.id);
  }

  @Post('accept')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Accept an invitation with a link token or a code',
    description:
      'Requires a session on the invited phone number. Activates the membership and changes the caller’s permissions, so clients should re-fetch /auth/me afterwards.',
  })
  accept(@Body() dto: AcceptInviteDto, @CurrentUser() user: AuthUser) {
    return this.invites.accept(user.id, dto);
  }
}
