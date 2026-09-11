import type { ScheduledMessage } from '@/types';

export type PendingScheduleInput = Pick<
  ScheduledMessage,
  'chatId' | 'chatName' | 'text' | 'when' | 'createdAt'
> & {
  operationId: string;
};

export type TelegramScheduledMessage = {
  id: string | number;
  message: string;
  date: Date | number;
};

export type TelegramScheduleResult = {
  success: boolean;
  telegramMessageId?: string | number;
  id?: string | number;
  error?: string;
};

export function createPendingSchedule(
  input: PendingScheduleInput
): ScheduledMessage {
  return {
    ...input,
    id: input.operationId,
    status: 'pending',
  };
}

export function applyScheduleResult(
  messages: ScheduledMessage[],
  operationId: string,
  result: TelegramScheduleResult
): ScheduledMessage[] {
  if (!result.success) {
    return messages;
  }

  const telegramMessageId = result.telegramMessageId ?? result.id;

  return messages.map((message) =>
    message.operationId === operationId
      ? {
          ...message,
          status: 'scheduled',
          telegramMessageId,
        }
      : message
  );
}

export function getPendingSchedules(
  messages: ScheduledMessage[]
): ScheduledMessage[] {
  return messages.filter((message) => message.status === 'pending');
}

export function findMatchingScheduledMessage(
  messages: TelegramScheduledMessage[],
  text: string,
  targetTimestamp: number,
  toleranceSeconds = 10
): TelegramScheduledMessage | undefined {
  return messages.find((message) => {
    const messageTimestamp = message.date instanceof Date
      ? Math.floor(message.date.getTime() / 1000)
      : Number(message.date);

    return (
      message.message === text &&
      Math.abs(messageTimestamp - targetTimestamp) <= toleranceSeconds
    );
  });
}
