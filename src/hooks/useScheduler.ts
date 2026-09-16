import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Chat, NotificationType, RichTextEntity, ScheduledMessage } from '@/types';
import type { InlineKeyboardMarkup } from '@/lib/inlineKeyboard';
import {
  applyScheduleResult,
  createPendingSchedule,
  getScheduleOccurrences,
  getPendingSchedules,
} from '@/lib/scheduling';
import type { ScheduleRepeatOptions } from '@/lib/scheduling';
import {
  loadSent,
  loadUpcoming,
  saveSent,
  saveUpcoming,
} from '@/lib/storage';
import {
  getCurrentTimeStr,
  getTodayStr,
  uid,
} from '@/lib/utils';

export type AssistantIntentLike = {
  action: 'schedule' | 'clarify';
  chat: string;
  message: string;
  date: string;
  time: string;
  clarification: string;
  attachments?: string[];
};

export type UseSchedulerOptions = {
  connected: boolean;
  selectedChat: Chat | null;
  chats: Chat[];
  message: string;
  showNotification: (message: string, type: NotificationType, title: string) => void;
  setMessage: Dispatch<SetStateAction<string>>;
  setAssistantPrompt: Dispatch<SetStateAction<string>>;
  setAssistantResponse: Dispatch<SetStateAction<string>>;
  setAssistantIntent: Dispatch<SetStateAction<AssistantIntentLike | null>>;
};

export function useScheduler({
  connected,
  selectedChat,
  chats,
  message,
  showNotification,
  setMessage,
  setAssistantPrompt,
  setAssistantResponse,
  setAssistantIntent,
}: UseSchedulerOptions) {
  const [date, setDate] = useState(getTodayStr());
  const [time, setTime] = useState(getCurrentTimeStr());
  const dateEditedRef = useRef(false);
  const timeEditedRef = useRef(false);
  const [upcoming, setUpcoming] = useState<ScheduledMessage[]>([]);
  const [sent, setSent] = useState<ScheduledMessage[]>([]);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'sent'>('upcoming');
  const [scheduling, setScheduling] = useState(false);
  const [successPulse, setSuccessPulse] = useState(false);
  const [lastAction, setLastAction] = useState<'sent' | 'scheduled' | null>(null);
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [cancelingIds, setCancelingIds] = useState<Set<string>>(new Set());
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const [publishingDraft, setPublishingDraft] = useState(false);
  const openPickerRef = useRef<'date' | 'time' | null>(null);

  useEffect(() => {
    const loadedUpcoming = loadUpcoming();
    const loadedSent = loadSent();

    setUpcoming(loadedUpcoming);
    setSent(loadedSent);
  }, []);

  useEffect(() => {
    if (!connected) return;

    let cancelled = false;

    async function recoverPendingSchedules() {
      const pendingMessages = getPendingSchedules(loadUpcoming());

      for (const pendingMessage of pendingMessages) {
        const result = await window.telegram.schedule({
          chatId: pendingMessage.chatId,
          message: pendingMessage.text,
          targetTimestamp: Math.floor(
            new Date(pendingMessage.when).getTime() / 1000
          ),
          attachments: pendingMessage.attachments ?? [],
          entities: pendingMessage.entities ?? [],
          replyMarkup: pendingMessage.replyMarkup,
        });

        if (cancelled) return;

        setUpcoming((current) => {
          const updated = result.success
            ? applyScheduleResult(current, pendingMessage.operationId!, result)
            : current;

          saveUpcoming(updated);
          return updated;
        });

        if (!result.success) {
          showNotification(
            result.error || 'Pending message could not be scheduled.',
            'error',
            'Scheduling failed'
          );
        }
      }
    }

    recoverPendingSchedules().catch((error) => {
      if (!cancelled) {
        showNotification(
          error instanceof Error
            ? error.message
            : 'Pending message could not be recovered.',
          'error',
          'Scheduling failed'
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [connected, showNotification]);

  useEffect(() => {
    const moveDueMessages = () => {
      const now = Date.now();
      const dueMessages = upcoming.filter(
        (msg) =>
          (msg.status === 'scheduled' || msg.status === 'confirmed') &&
          new Date(msg.when).getTime() <= now
      );

      if (dueMessages.length === 0) return;

      const dueIds = new Set(dueMessages.map((msg) => msg.id));
      const sentMessages = dueMessages.map((msg) => ({
        ...msg,
        status: 'sent' as const,
        sentAt: new Date().toISOString(),
      }));

      setUpcoming((current) => {
        const updated = current.filter((msg) => !dueIds.has(msg.id));
        saveUpcoming(updated);
        return updated;
      });

      setSent((current) => {
        const existingIds = new Set(current.map((msg) => msg.id));
        const updated = [
          ...sentMessages.filter((msg) => !existingIds.has(msg.id)),
          ...current,
        ];
        saveSent(updated);
        return updated;
      });

      setRevealingId(dueMessages[0].id);
      window.setTimeout(() => setRevealingId(null), 1500);
    };

    moveDueMessages();
    const intervalId = window.setInterval(moveDueMessages, 1000);

    return () => window.clearInterval(intervalId);
  }, [upcoming]);

  function handleSchedule(assistantSchedule?: {
    chatId: string;
    message: string;
    date: string;
    time: string;
    attachments?: string[];
    entities?: RichTextEntity[];
    replyMarkup?: InlineKeyboardMarkup;
  }, repeatOptions: ScheduleRepeatOptions = { mode: 'none', occurrences: 1 }) {
    if (scheduling) return;

    const scheduleChat = assistantSchedule
      ? chats.find((chat) => chat.id === assistantSchedule.chatId) || null
      : selectedChat;
    const scheduleMessage = assistantSchedule?.message ?? message;
    const scheduleDate = assistantSchedule?.date ?? date;
    const scheduleTime = assistantSchedule?.time ?? time;

    if (!scheduleChat) {
      showNotification(
        'Select a chat first.',
        'warning',
        'No chat selected'
      );
      return;
    }

    if (!scheduleMessage.trim()) {
      showNotification(
        'Message cannot be empty.',
        'warning',
        'Empty message'
      );
      return;
    }

    if (!scheduleDate || !scheduleTime) {
      showNotification(
        'Set date and time.',
        'warning',
        'Missing schedule'
      );
      return;
    }

    const whenDate = new Date(`${scheduleDate}T${scheduleTime}`);

    if (Number.isNaN(whenDate.getTime())) {
      showNotification(
        'Invalid date or time.',
        'error',
        'Invalid schedule'
      );
      return;
    }

    if (whenDate.getTime() <= Date.now()) {
      showNotification(
        'Schedule time must be in the future.',
        'warning',
        'Past time'
      );
      return;
    }

    setScheduling(true);

    const chatId = scheduleChat.id;
    const chatName = scheduleChat.name;
    const text = scheduleMessage;
    const attachments = assistantSchedule?.attachments ?? [];
    const entities = assistantSchedule?.entities ?? [];
    const replyMarkup = assistantSchedule?.replyMarkup;
    const occurrenceDates = getScheduleOccurrences(whenDate, repeatOptions);
    const pendingMessages = occurrenceDates.map((occurrenceDate) => createPendingSchedule({
      operationId: uid(),
      chatId,
      chatName,
      text,
      attachments,
      when: occurrenceDate.toISOString(),
      createdAt: new Date().toISOString(),
      entities,
      replyMarkup,
    }));

    setUpcoming((current) => {
      const updated = [...current, ...pendingMessages];
      saveUpcoming(updated);
      return updated;
    });

    Promise.all(pendingMessages.map((pendingMessage) => window.telegram.schedule({
      chatId,
      message: text,
      targetTimestamp: Math.floor(new Date(pendingMessage.when).getTime() / 1000),
      attachments,
      entities,
      replyMarkup,
    }).then((result) => ({ result, operationId: pendingMessage.operationId! }))))
      .then((results) => {
        setScheduling(false);
        const successful = results.filter(({ result }) => result.success);

        successful.forEach(({ result, operationId }) => {
          const telegramMessageId = result.telegramMessageId ?? result.id;
          setUpcoming((current) => {
            const updated = applyScheduleResult(current, operationId, {
              success: true,
              telegramMessageId,
            });
            saveUpcoming(updated);
            return updated;
          });
        });

        if (successful.length === 0) {
          showNotification(
            results[0]?.result.error || 'Failed to schedule message.',
            'error',
            'Error'
          );
          return;
        }

        setMessage('');
        setAssistantPrompt('');
        setAssistantResponse('');
        setAssistantIntent(null);
        showNotification(
          successful.length === 1
            ? 'Message scheduled in Telegram.'
            : `${successful.length} messages scheduled in Telegram.`,
          'success',
          'Scheduled'
        );
        setLastAction('scheduled');
        setSuccessPulse(true);
        window.setTimeout(() => setSuccessPulse(false), 1500);
      })
      .catch((error) => {
        setScheduling(false);
        showNotification(
          error instanceof Error ? error.message : 'Network error while scheduling.',
          'error',
          'Error'
        );
      });
  }

  function handleCancelMessage(msg: ScheduledMessage) {
    if (cancelingIds.has(msg.id)) return;

    if (
      msg.telegramMessageId === undefined ||
      msg.telegramMessageId === null
    ) {
      showNotification(
        'Telegram message ID is missing.',
        'error',
        'Cannot unschedule'
      );
      return;
    }

    setCancelingIds((prev) => {
      const next = new Set(prev);
      next.add(msg.id);
      return next;
    });

    window.telegram
      .cancel({
        chatId: msg.chatId,
        telegramMessageId: msg.telegramMessageId,
      })
      .then((result) => {
        setCancelingIds((prev) => {
          const next = new Set(prev);
          next.delete(msg.id);
          return next;
        });

        if (result.success) {
          const updated = upcoming.filter(
            (item) => item.id !== msg.id
          );

          setUpcoming(updated);
          saveUpcoming(updated);

          showNotification(
            'Message unscheduled.',
            'info',
            'Unscheduled'
          );
        } else {
          showNotification(
            result.error || 'Failed to cancel.',
            'error',
            'Error'
          );
        }
      })
      .catch((error) => {
        setCancelingIds((prev) => {
          const next = new Set(prev);
          next.delete(msg.id);
          return next;
        });

        showNotification(
          error instanceof Error
            ? error.message
            : 'Network error while cancelling.',
          'error',
          'Error'
        );
      });
  }

  function handleSendNow(msg: ScheduledMessage) {
    if (sendingIds.has(msg.id)) return;

    setSendingIds((prev) => {
      const next = new Set(prev);
      next.add(msg.id);
      return next;
    });

    let scheduleCancelled = msg.telegramMessageId === undefined;
    const cancelExistingSchedule: Promise<{ success: boolean; error?: string }> = msg.telegramMessageId === undefined
      ? Promise.resolve({ success: true })
      : window.telegram.cancel({
        chatId: msg.chatId,
        telegramMessageId: msg.telegramMessageId,
      });

    cancelExistingSchedule
      .then((cancelResult) => {
        if (!cancelResult.success) {
          throw new Error(cancelResult.error || 'The scheduled message could not be cancelled.');
        }

        scheduleCancelled = true;

        return window.telegram.send(msg.chatId, msg.text, msg.attachments ?? [], msg.entities ?? [], msg.replyMarkup);
      })
      .then((result) => {
        setSendingIds((prev) => {
          const next = new Set(prev);
          next.delete(msg.id);
          return next;
        });

        if (result.success) {
          const sentMsg: ScheduledMessage = {
            ...msg,
            status: 'sent',
            sentAt: new Date().toISOString(),
          };

          const updatedUpcoming = upcoming.filter(
            (item) => item.id !== msg.id
          );

          setUpcoming(updatedUpcoming);
          saveUpcoming(updatedUpcoming);

          const updatedSent = [sentMsg, ...sent];

          setSent(updatedSent);
          saveSent(updatedSent);

          showNotification('Message sent to Telegram.', 'success', 'Sent');

          setRevealingId(msg.id);
          window.setTimeout(() => setRevealingId(null), 1500);
        } else {
          showNotification(
            result.error || 'Failed to send.',
            'error',
            'Error'
          );
        }
      })
      .catch((error) => {
        if (scheduleCancelled && msg.telegramMessageId !== undefined) {
          setUpcoming((current) => {
            const updated = current.map((item) =>
              item.id === msg.id
                ? { ...item, status: 'pending' as const, telegramMessageId: undefined }
                : item,
            );
            saveUpcoming(updated);
            return updated;
          });
        }

        setSendingIds((prev) => {
          const next = new Set(prev);
          next.delete(msg.id);
          return next;
        });

        showNotification(
          error instanceof Error
            ? error.message
            : 'Network error while sending.',
          'error',
          'Error'
        );
      });
  }

  async function handleSendDraftNow(
    chat: Chat,
    text: string,
    attachments: string[] = [],
    entities: RichTextEntity[] = [],
    replyMarkup?: InlineKeyboardMarkup,
  ) {
    if (publishingDraft || !text.trim()) return;

    setPublishingDraft(true);

    try {
      const result = await window.telegram.send(chat.id, text, attachments, entities, replyMarkup);

      if (!result.success) {
        throw new Error(result.error || 'Failed to send message.');
      }

      const sentMessage: ScheduledMessage = {
        id: uid(),
        chatId: chat.id,
        chatName: chat.name,
        text,
        attachments,
        when: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        status: 'sent',
        sentAt: new Date().toISOString(),
        entities,
      };

      setSent((current) => {
        const updated = [sentMessage, ...current];
        saveSent(updated);
        return updated;
      });
      setMessage('');
      setSuccessPulse(true);
      setLastAction('sent');
      showNotification('Message sent to Telegram.', 'success', 'Sent');
      window.setTimeout(() => setSuccessPulse(false), 1500);
      window.setTimeout(() => setLastAction(null), 1500);
    } catch (error) {
      showNotification(
        error instanceof Error ? error.message : 'Network error while sending.',
        'error',
        'Send failed',
      );
    } finally {
      setPublishingDraft(false);
    }
  }

  function handleDeleteMessage(msg: ScheduledMessage) {
    if (!window.confirm('Remove this message from local history?')) return;

    if (msg.status !== 'sent') {
      const updated = upcoming.filter(
        (item) => item.id !== msg.id
      );

      setUpcoming(updated);
      saveUpcoming(updated);
    } else {
      const updated = sent.filter(
        (item) => item.id !== msg.id
      );

      setSent(updated);
      saveSent(updated);
    }
  }

  function handleClearSent() {
    setSent([]);
    saveSent([]);

    showNotification(
      'Sent history cleared.',
      'info',
      'Cleared'
    );
  }

  function handleClearAll() {
    if (upcoming.length === 0) return;

    if (!window.confirm('Cancel all upcoming messages?')) return;

    const cancelable = upcoming.filter(
      (msg) =>
        msg.telegramMessageId !== undefined &&
        msg.telegramMessageId !== null
    );

    Promise.all(
      cancelable.map((msg) =>
        window.telegram
          .cancel({
            chatId: msg.chatId,
            telegramMessageId: msg.telegramMessageId!,
          })
          .then((result) => ({ message: msg, success: result.success }))
          .catch(() => ({ message: msg, success: false }))
      )
    ).then((results) => {
      const failedIds = new Set(
        results.filter((result) => !result.success).map((result) => result.message.id),
      );
      const remaining = upcoming.filter((msg) => failedIds.has(msg.id));

      setUpcoming(remaining);
      saveUpcoming(remaining);

      showNotification(
        failedIds.size > 0
          ? 'Some messages could not be cancelled and remain in Upcoming.'
          : 'All upcoming messages cancelled.',
        failedIds.size > 0 ? 'warning' : 'success',
        failedIds.size > 0 ? 'Partial cancellation' : 'Cleared',
      );
    });
  }

  return {
    date,
    setDate,
    time,
    setTime,
    dateEditedRef,
    timeEditedRef,
    upcoming,
    setUpcoming,
    sent,
    setSent,
    activeTab,
    setActiveTab,
    scheduling,
    setScheduling,
    successPulse,
    lastAction,
    setSuccessPulse,
    revealingId,
    setRevealingId,
    cancelingIds,
    sendingIds,
    publishingDraft,
    openPickerRef,
    handleSchedule,
    handleCancelMessage,
    handleSendNow,
    handleSendDraftNow,
    handleDeleteMessage,
    handleClearSent,
    handleClearAll,
  };
}
