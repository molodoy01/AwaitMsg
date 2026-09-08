export interface Chat {
  id: string;
  name: string;
}

export interface ScheduledMessage {
  id: string;
  chatId: string;
  chatName: string;
  text: string;
  when: string;
  createdAt: string;
  status: 'scheduled' | 'confirmed' | 'sent';
  sentAt?: string;
  telegramMessageId?: string | number;
}

export type NotificationType = 'error' | 'warning' | 'success' | 'info';

export interface NotificationState {
  message: string;
  type: NotificationType;
  title: string;
  visible: boolean;
}
