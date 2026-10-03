import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { DeviceTokensService } from './device-tokens.service';
import { RegisterDeviceDto } from './dto/device.dto';
import { NotificationsService } from './notifications.service';

/** In-app notification centre for the signed-in user (customer or seller). */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly devices: DeviceTokensService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'My notifications (optional ?unread=true)' })
  list(@CurrentUser('id') userId: string, @Query('unread') unread?: string) {
    return this.notifications.listMine(userId, unread === 'true' || unread === '1');
  }

  @Get('unread-count')
  count(@CurrentUser('id') userId: string) {
    return this.notifications.unreadCount(userId).then((unread) => ({ unread }));
  }

  @Patch(':id/read')
  markRead(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.notifications.markRead(userId, id);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser('id') userId: string) {
    return this.notifications.markAllRead(userId);
  }

  /**
   * The mobile app calls this on every launch, not once at install: a push
   * token is rotated by the OS, by a reinstall and by a restore from backup.
   * Re-registering the same token updates the row rather than adding one.
   */
  @Post('devices')
  @ApiOperation({ summary: 'Register this device for push, or refresh its token' })
  registerDevice(@CurrentUser('id') userId: string, @Body() dto: RegisterDeviceDto) {
    return this.devices.register(userId, dto);
  }

  @Delete('devices/:token')
  @ApiOperation({
    summary: 'Stop pushing to this device',
    description:
      'Called on sign-out. The row is disabled rather than deleted, so "we deliberately ' +
      'stopped" stays distinguishable from "we never knew about it".',
  })
  forgetDevice(@CurrentUser('id') userId: string, @Param('token') token: string) {
    return this.devices.forget(userId, token);
  }
}
