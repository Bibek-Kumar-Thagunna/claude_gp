import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

/** In-app notification centre for the signed-in user (customer or seller). */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

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
}
