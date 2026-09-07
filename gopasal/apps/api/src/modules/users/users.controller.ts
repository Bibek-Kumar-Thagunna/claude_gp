import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AddressesService } from './addresses.service';
import { AddressDto, UpdateAddressDto, UpdateProfileDto } from './dto/users.dto';
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
