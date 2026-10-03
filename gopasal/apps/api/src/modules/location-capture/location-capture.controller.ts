import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { RequirePermissions } from '../../rbac/require-permissions.decorator';
import { CreateLocationCaptureDto, SubmitCapturedLocationDto } from './dto/location-capture.dto';
import { LocationCaptureService } from './location-capture.service';

@ApiTags('seller:location-capture')
@Controller()
export class LocationCaptureController {
  constructor(private readonly captures: LocationCaptureService) {}

  @Post('seller/onboarding/applications/:applicationId/location-captures')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a one-use phone location link for an editable application' })
  createForApplication(
    @CurrentUser('id') userId: string,
    @Param('applicationId') applicationId: string,
    @Body() dto: CreateLocationCaptureDto,
  ) {
    return this.captures.createForApplication(userId, applicationId, dto.mode);
  }

  @Get('seller/onboarding/applications/:applicationId/location-captures/:captureId')
  @ApiBearerAuth()
  statusForApplication(
    @CurrentUser('id') userId: string,
    @Param('applicationId') applicationId: string,
    @Param('captureId') captureId: string,
  ) {
    return this.captures.statusForApplication(userId, applicationId, captureId);
  }

  @Post('seller/shops/:shopId/location-captures')
  @ApiBearerAuth()
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Create a one-use phone location link for a shop pin update' })
  createForShop(
    @CurrentUser('id') userId: string,
    @Param('shopId') shopId: string,
    @Body() dto: CreateLocationCaptureDto,
  ) {
    return this.captures.createForShop(userId, shopId, dto.mode);
  }

  @Get('seller/shops/:shopId/location-captures/:captureId')
  @ApiBearerAuth()
  @RequirePermissions('settings.manage')
  statusForShop(
    @CurrentUser('id') userId: string,
    @Param('shopId') shopId: string,
    @Param('captureId') captureId: string,
  ) {
    return this.captures.statusForShop(userId, shopId, captureId);
  }

  @Get('public/location-captures/:token')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  publicInfo(@Param('token') token: string) {
    return this.captures.publicInfo(token);
  }

  @Post('public/location-captures/:token')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  submit(@Param('token') token: string, @Body() dto: SubmitCapturedLocationDto) {
    return this.captures.submit(token, dto);
  }
}
