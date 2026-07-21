import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';

/**
 * Notification Engine — sole in-app alert delivery boundary.
 *
 * Public API (via NotificationsService):
 * - send() / notifyFromPlan()
 * - queueSms() (outbox stub)
 * - getForUser() / unread / markRead
 * - runPhase12Scans()
 *
 * Listens: inventory.low-stock, pos.day.closed (+ crons).
 * Consumers: Workshop (SMS stub), CustomerCredit (reminders).
 * Transactional email stays on MailService (auth / tenant welcome).
 */
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}

/** Alias — Shared Notification Engine entrypoint. */
export { NotificationsService, NotificationsService as NotificationEngine } from './notifications.service';
export { CreateNotificationDto } from './notifications.dto';
export {
  planLowStockAlert,
  shouldSendNotification,
  defaultChannelFor,
  recipientRoleTypes,
} from './notification-triggers.helper';
