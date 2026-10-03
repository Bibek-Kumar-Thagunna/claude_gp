import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AuthUser } from '../common/types/auth-user';
import type { AppConfig } from '../config/configuration';
import { AuthService } from './auth.service';
import {
  legacyRefreshCookieExpiry,
  readCookieAuthSurface,
  readRefreshCookie,
  refreshCookieHeader,
  wantsCookieAuth,
  type CookieAuthSurface,
} from './auth-cookie';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LogoutDto, RefreshDto, RequestOtpDto, VerifyOtpDto } from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private setRefreshCookie(
    res: Response,
    surface: CookieAuthSurface,
    token?: string,
  ): void {
    const prefix = this.config.get('apiPrefix', { infer: true }).replace(/^\/+|\/+$/g, '');
    const path = `/${prefix}/v1/auth`;
    const secure = this.config.get('isDeployed', { infer: true });
    res.append(
      'Set-Cookie',
      refreshCookieHeader({
        surface,
        token,
        maxAgeSeconds: this.config.get('jwt', { infer: true }).refreshTtl,
        path,
        secure,
      }),
    );
    // Old builds used one cookie for every web surface. Expire it whenever a
    // current client establishes or clears a scoped session so it cannot later
    // be mistaken for an active credential by an old tab.
    res.append('Set-Cookie', legacyRefreshCookieExpiry(path, secure));
    res.setHeader('Cache-Control', 'no-store');
  }

  private refreshToken(dtoToken: string | undefined, req: Request): string {
    // Never mix the two credential channels. Otherwise a cookie-mode request
    // carrying somebody else's body token could replace the browser's session.
    const cookieMode = wantsCookieAuth(req);
    const surface = cookieMode ? readCookieAuthSurface(req) : undefined;
    if (cookieMode && !surface) {
      throw new UnauthorizedException('Browser auth surface required');
    }
    const token = cookieMode && surface ? readRefreshCookie(req, surface) : dtoToken;
    if (!token) throw new UnauthorizedException('Refresh token required');
    return token;
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('otp/request')
  @ApiOperation({ summary: 'Send a one-time login code via SMS' })
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.auth.requestOtp(dto);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('otp/verify')
  @ApiOperation({ summary: 'Verify OTP, create the account if new, and issue tokens' })
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Validate the browser credential channel before consuming the OTP and
    // creating a session. A mismatched surface must not leave an unreachable
    // refresh session behind in the database.
    const cookieMode = wantsCookieAuth(req);
    const cookieSurface = cookieMode ? readCookieAuthSurface(req) : undefined;
    if (cookieMode && (!cookieSurface || cookieSurface !== (dto.surface ?? 'customer'))) {
      throw new UnauthorizedException('Browser auth surface mismatch');
    }
    const result = await this.auth.verifyOtp({
      ...dto,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    res.setHeader('Cache-Control', 'no-store');
    if (!cookieMode) return result;
    this.setRefreshCookie(res, cookieSurface!, result.tokens.refreshToken);
    return { ...result, tokens: { ...result.tokens, refreshToken: '' } };
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate the refresh token and get a fresh access token' })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieMode = wantsCookieAuth(req);
    const tokens = await this.auth.refresh(this.refreshToken(dto.refreshToken, req), {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    res.setHeader('Cache-Control', 'no-store');
    if (!cookieMode) return tokens;
    const surface = readCookieAuthSurface(req);
    if (!surface) throw new UnauthorizedException('Browser auth surface required');
    this.setRefreshCookie(res, surface, tokens.refreshToken);
    return { ...tokens, refreshToken: '' };
  }

  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Revoke the current session' })
  async logout(
    @Body() dto: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieMode = wantsCookieAuth(req);
    const result = await this.auth.logout(this.refreshToken(dto.refreshToken, req));
    res.setHeader('Cache-Control', 'no-store');
    if (cookieMode) {
      const surface = readCookieAuthSurface(req);
      if (!surface) throw new UnauthorizedException('Browser auth surface required');
      this.setRefreshCookie(res, surface);
    }
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Current user, memberships and resolved permissions' })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.profile(user.id);
  }
}
