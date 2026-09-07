import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { smsProviderFactory, SMS_PROVIDER } from './sms.provider';
import { TokenService } from './token.service';

/**
 * OTP login + JWT sessions. Secrets are passed per sign/verify call (from
 * config) so JwtModule is registered empty. Exports AuthService, TokenService
 * and the guard for other feature modules.
 *
 * SMS_PROVIDER is exported too: one-time codes are not the only thing GoPasal
 * has to put in someone's hand — staff invitations travel the same way, and they
 * must use the same configured gateway rather than a second instance of it.
 */
@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, TokenService, JwtStrategy, JwtAuthGuard, smsProviderFactory],
  exports: [AuthService, TokenService, JwtAuthGuard, JwtModule, PassportModule, SMS_PROVIDER],
})
export class AuthModule {}
