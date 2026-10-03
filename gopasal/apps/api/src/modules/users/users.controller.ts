import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AddressesService } from './addresses.service';
import {
  AddressDto,
  DeleteAccountDto,
  UpdateAddressDto,
  UpdateProfileDto,
} from './dto/users.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users/me')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly addresses: AddressesService,
  ) {}

  @Get()
  me(@CurrentUser('id') userId: string) {
    return this.users.me(userId);
  }

  @Patch()
  update(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.users.update(userId, dto);
  }

  @Throttle({ default: { ttl: 60_000, limit: 2 } })
  @Get('data-export')
  async exportData(
    @CurrentUser('id') userId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const date = new Date().toISOString().slice(0, 10);
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="gopasal-data-${date}.json"`);
    response.setHeader('Cache-Control', 'private, no-store, max-age=0');
    response.setHeader('Pragma', 'no-cache');
    return this.users.exportData(userId);
  }

  @Get('deletion-eligibility')
  deletionEligibility(@CurrentUser('id') userId: string) {
    return this.users.deletionEligibility(userId);
  }

  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post('deletion-code')
  requestDeletionCode(@CurrentUser('id') userId: string) {
    return this.users.requestDeletionCode(userId);
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Delete()
  deleteAccount(@CurrentUser('id') userId: string, @Body() dto: DeleteAccountDto) {
    return this.users.deleteAccount(userId, dto.code, dto.reason);
  }

  @Get('addresses')
  listAddresses(@CurrentUser('id') userId: string) {
    return this.addresses.list(userId);
  }

  @Post('addresses')
  addAddress(@CurrentUser('id') userId: string, @Body() dto: AddressDto) {
    return this.addresses.create(userId, dto);
  }

  @Patch('addresses/:id')
  updateAddress(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addresses.update(userId, id, dto);
  }

  @Put('addresses/:id/default')
  setDefault(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.addresses.setDefault(userId, id);
  }

  @Delete('addresses/:id')
  removeAddress(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.addresses.remove(userId, id);
  }
}
