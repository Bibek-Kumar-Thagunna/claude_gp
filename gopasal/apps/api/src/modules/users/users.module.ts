import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { AddressesService } from './addresses.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService, AddressesService],
  exports: [UsersService, AddressesService],
})
export class UsersModule {}
