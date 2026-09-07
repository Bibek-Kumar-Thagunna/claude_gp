import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { InvitesService } from './invites.service';
import { InvitesPublicController } from './invites.public.controller';
import { PlatformInvitesController } from './invites.platform.controller';
import { ShopInvitesController } from './invites.shop.controller';

/**
 * Access provisioning. One service, three surfaces: the shop owner's team
 * screen, the platform staff screen, and the invitee's join page.
 *
 * AuthModule is imported for SMS_PROVIDER (invites are delivered by text, the
 * same channel as one-time codes); NotificationsModule for the "your invite was
 * accepted" note back to whoever sent it.
 */
@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [ShopInvitesController, PlatformInvitesController, InvitesPublicController],
  providers: [InvitesService],
  exports: [InvitesService],
})
export class InvitesModule {}
