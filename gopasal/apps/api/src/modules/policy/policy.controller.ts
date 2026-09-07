import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { PolicyService } from './policy.service';

/** Public policy reading + authenticated acceptance tracking. */
@ApiTags('policies')
@Controller('policies')
export class PolicyController {
  constructor(private readonly policy: PolicyService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Current published policy documents (all keys)' })
  list() {
    return this.policy.listCurrent();
  }

  @Get('me/acceptances')
  @ApiBearerAuth()
  myAcceptances(@CurrentUser('id') userId: string) {
    return this.policy.myAcceptances(userId);
  }

  @Get(':key')
  @Public()
  @ApiOperation({ summary: 'Current published version of one policy' })
  current(@Param('key') key: string) {
    return this.policy.current(key);
  }

  @Post(':policyId/accept')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Record that I accepted this policy version' })
  accept(@CurrentUser('id') userId: string, @Param('policyId') policyId: string) {
    return this.policy.accept(userId, policyId);
  }
}
