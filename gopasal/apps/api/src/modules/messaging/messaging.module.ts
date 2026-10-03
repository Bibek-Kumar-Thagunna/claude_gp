import { Module } from '@nestjs/common';
import { MessagingCustomerController } from './messaging.customer.controller';
import { MessagingSellerController } from './messaging.seller.controller';
import { MessagingService } from './messaging.service';

@Module({
  controllers: [MessagingCustomerController, MessagingSellerController],
  providers: [MessagingService],
  exports: [MessagingService],
})
export class MessagingModule {}
