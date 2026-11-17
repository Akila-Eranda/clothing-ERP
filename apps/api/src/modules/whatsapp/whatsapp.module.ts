import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { CustomerPaymentNotificationService } from './customer-payment-notification.service';

@Module({
  controllers: [WhatsappController],
  providers: [WhatsappService, CustomerPaymentNotificationService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
