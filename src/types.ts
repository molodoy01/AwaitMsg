export interface Chat {
  id: string;
  name: string;
  username?: string;
  type?: 'private' | 'group' | 'supergroup' | 'channel' | 'unknown';
  avatarDataUrl?: string;
}

export interface Template {
  id: string;
  name: string;
  body: string;
  entities?: RichTextEntity[];
  createdAt: string;
  updatedAt: string;
}

export type RichTextEntityType =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'text_url';

export interface RichTextEntity {
  type: RichTextEntityType;
  offset: number;
  length: number;
  url?: string;
}

export interface ScheduledMessage {
  id: string;
  chatId: string;
  chatName: string;
  text: string;
  when: string;
  createdAt: string;
  status: 'pending' | 'scheduled' | 'confirmed' | 'sent';
  attachments?: string[];
  entities?: RichTextEntity[];
  operationId?: string;
  sentAt?: string;
  telegramMessageId?: string | number;
}

export interface PreviewHistoryMessage {
  id: string;
  text: string;
  date: string;
  outgoing: boolean;
  senderName?: string;
  mediaType?: string;
  mediaName?: string;
  media?: PreviewHistoryMedia;
  groupId?: string;
}

export interface PreviewHistoryMedia {
  kind: 'photo' | 'video' | 'document' | 'audio' | 'unknown';
  name?: string;
  mimeType?: string;
  size?: number;
  duration?: number;
  width?: number;
  height?: number;
  thumbnailDataUrl?: string;
  dataUrl?: string;
}

export interface PreviewChatHistory {
  chat: {
    id: string;
    title: string;
    username?: string;
    type?: string;
    avatarDataUrl?: string;
    topic?: string;
  };
  messages: PreviewHistoryMessage[];
}

export type NotificationType = 'error' | 'warning' | 'success' | 'info';

export type NotificationState = {
  message: string;
  type: NotificationType;
  title: string;
  visible: boolean;
};
