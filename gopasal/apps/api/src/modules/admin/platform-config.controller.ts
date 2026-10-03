import { Body, Controller, DefaultValuePipe, Get, ParseEnumPipe, Post, Query, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigEnvironment } from '@prisma/client';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/require-permissions.decorator';
import { Audit } from '../audit/audit.decorator';
import { AuditInterceptor } from '../audit/audit.interceptor';
import { CreatePlatformConfigDto, SetFeatureFlagDto } from './dto/admin.dto';
import { PlatformConfigService } from './platform-config.service';

@ApiTags('admin:configuration')
@ApiBearerAuth()
@UseInterceptors(AuditInterceptor)
@Controller('admin/config')
export class PlatformConfigController {
  constructor(private readonly config: PlatformConfigService) {}

  @Get()
  @RequirePermissions('settings.platform.view')
  @ApiOperation({ summary: 'Read current and historical platform configuration' })
  get(@Query('environment', new DefaultValuePipe(ConfigEnvironment.DEVELOPMENT), new ParseEnumPipe(ConfigEnvironment)) environment: ConfigEnvironment) {
    return this.config.configuration(environment);
  }

  @Post()
  @RequirePermissions('settings.platform.manage')
  @Audit('platform_config.create_version', 'PlatformConfigVersion')
  @ApiOperation({ summary: 'Create an immutable platform configuration version' })
  create(@CurrentUser('id') actorId: string, @Body() dto: CreatePlatformConfigDto) {
    return this.config.createConfiguration(actorId, dto);
  }

  @Get('features')
  @RequirePermissions('settings.platform.view')
  @ApiOperation({ summary: 'Read current and historical feature flags for one target' })
  features(@Query('environment', new DefaultValuePipe(ConfigEnvironment.DEVELOPMENT), new ParseEnumPipe(ConfigEnvironment)) environment: ConfigEnvironment, @Query('shopId') shopId?: string) {
    return this.config.featureFlags(environment, shopId);
  }

  @Post('features')
  @RequirePermissions('settings.platform.manage')
  @Audit('feature_flag.create_version', 'FeatureFlagVersion')
  @ApiOperation({ summary: 'Create an immutable feature-flag version' })
  setFeature(@CurrentUser('id') actorId: string, @Body() dto: SetFeatureFlagDto) {
    return this.config.setFeatureFlag(actorId, dto);
  }
}
