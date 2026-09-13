import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  Chat,
  ScheduledMessage,
  NotificationState,
  NotificationType,
} from '@/types';
import {
  loadUpcoming,
  loadSent,
  saveUpcoming,
  saveSent,
  loadChats,
  saveChats,
  loadHiddenChats,
  saveHiddenChats,
} from '@/lib/storage';
import {
  uid,
  getTodayStr,
  getCurrentTimeStr,
  getTimezoneLabel,
} from '@/lib/utils';
import {
  applyScheduleResult,
  createPendingSchedule,
  getPendingSchedules,
} from '@/lib/scheduling';
import { Notification } from '@/components/Notification';
import { ChatRemoveModal } from '@/components/ChatRemoveModal';
import { ChatPicker } from '@/components/ChatPicker';
import { MessagesPanel } from '@/components/MessagesPanel';
import { SettingsView } from '@/components/SettingsView';
import { Settings } from 'lucide-react';

const TEXT_ANIMATION_CONFIG = {
  typingSpeed: 28,
  deletingSpeed: 22,
  maxCatchUpSteps: 4,
};

function splitGraphemes(value: string): string[] {
  const intlWithSegmenter = Intl as typeof Intl & {
    Segmenter?: new (
      locales?: string | string[],
      options?: { granularity: 'grapheme' }
    ) => {
      segment(value: string): Iterable<{ segment: string }>;
    };
  };

  if (intlWithSegmenter.Segmenter) {
    const segmenter = new intlWithSegmenter.Segmenter(undefined, {
      granularity: 'grapheme',
    });

    return Array.from(segmenter.segment(value), ({ segment }) => segment);
  }

  return Array.from(value);
}

function useAnimatedText(targetText: string): string {
  const [displayedText, setDisplayedText] = useState('');
  const targetRef = useRef<string[]>([]);
  const displayedRef = useRef<string[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const lastStepAtRef = useRef<number | null>(null);

  useEffect(() => {
    targetRef.current = splitGraphemes(targetText);
    lastStepAtRef.current = null;

    if (animationFrameRef.current === null) {
      animationFrameRef.current = window.requestAnimationFrame(function animate(now) {
        const current = displayedRef.current;
        const target = targetRef.current;
        let sharedLength = 0;
        while (
          sharedLength < current.length &&
          sharedLength < target.length &&
          current[sharedLength] === target[sharedLength]
        ) {
          sharedLength += 1;
        }
        const isDeleting = current.length > sharedLength;
        const interval = isDeleting
          ? TEXT_ANIMATION_CONFIG.deletingSpeed
          : TEXT_ANIMATION_CONFIG.typingSpeed;
        const elapsedSinceStep = lastStepAtRef.current === null
          ? interval
          : now - lastStepAtRef.current;
        const elapsed = Math.min(
          elapsedSinceStep,
          interval * TEXT_ANIMATION_CONFIG.maxCatchUpSteps
        );
        const steps = Math.floor(elapsed / interval);

        if (steps === 0) {
          animationFrameRef.current = window.requestAnimationFrame(animate);
          return;
        }

        if (isDeleting) {
          displayedRef.current = current.slice(
            0,
            Math.max(sharedLength, current.length - steps)
          );
        } else if (current.length < target.length) {
          displayedRef.current = target.slice(
            0,
            Math.min(target.length, current.length + steps)
          );
        }

        lastStepAtRef.current = elapsedSinceStep > elapsed
          ? now
          : (lastStepAtRef.current ?? now - interval) + steps * interval;
        setDisplayedText(displayedRef.current.join(''));

        if (displayedRef.current.join('') === targetRef.current.join('')) {
          animationFrameRef.current = null;
          lastStepAtRef.current = null;
          return;
        }

        animationFrameRef.current = window.requestAnimationFrame(animate);
      });
    }
  }, [targetText]);

  useEffect(() => () => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
    }
  }, []);

  return displayedText;
}

type AssistantIntent = NonNullable<
  Awaited<ReturnType<Window['gemini']['generate']>>['intent']
>;
type GeminiSettings = Awaited<ReturnType<Window['gemini']['getSettings']>>;

function App() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [message, setMessage] = useState('');
  const [assistantPrompt, setAssistantPrompt] = useState('');
  const [assistantResponse, setAssistantResponse] = useState('');
  const displayedAssistantResponse = useAnimatedText(assistantResponse);
  const [assistantIntent, setAssistantIntent] = useState<AssistantIntent | null>(null);
  const [assistantExampleIndex, setAssistantExampleIndex] = useState(0);
  const [isThinking, setIsThinking] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [geminiSettings, setGeminiSettings] = useState<GeminiSettings>({
    hasKey: false,
    maskedKey: '',
    enabled: true,
    encryptionAvailable: true,
  });
  const [settingsKey, setSettingsKey] = useState('');
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [date, setDate] = useState(getTodayStr());
  const [time, setTime] = useState(getCurrentTimeStr());
  const dateEditedRef = useRef(false);
  const timeEditedRef = useRef(false);
  const [upcoming, setUpcoming] = useState<ScheduledMessage[]>([]);
  const [sent, setSent] = useState<ScheduledMessage[]>([]);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'sent'>('upcoming');

  const [connected, setConnected] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [returningUserName, setReturningUserName] = useState('');
  const [connecting, setConnecting] = useState(true);
  const [connectionResolved, setConnectionResolved] = useState(false);
  const [authStep, setAuthStep] = useState<'phone' | 'code' | 'password'>('phone');
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [twoFactorPassword, setTwoFactorPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isConfirmingLogout, setIsConfirmingLogout] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [successPulse, setSuccessPulse] = useState(false);
  const [revealingId, setRevealingId] = useState<string | null>(null);

  const [notification, setNotification] = useState<NotificationState>({
    message: '',
    type: 'error',
    title: '',
    visible: false,
  });

  const [removeModal, setRemoveModal] = useState<{
    show: boolean;
    chat: Chat | null;
  }>({
    show: false,
    chat: null,
  });

  const [cancelingIds, setCancelingIds] = useState<Set<string>>(new Set());
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const openPickerRef = useRef<'date' | 'time' | null>(null);
  const assistantExamples = [
    'Tell me what to send and when — I’ll help you schedule it.',
    'Message Sasha tomorrow at 10 so he does not forget the documents.',
    'AI Assistant requires a Gemini API key — add yours in Settings.',
  ];

  const notificationTimeoutRef = useRef<number | null>(null);

  const showNotification = useCallback(
    (message: string, type: NotificationType, title: string) => {
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }

      setNotification({
        message,
        type,
        title,
        visible: true,
      });

      notificationTimeoutRef.current = window.setTimeout(() => {
        setNotification((prev) => ({
          ...prev,
          visible: false,
        }));
      }, 4500);
    },
    []
  );

  const closeNotification = useCallback(() => {
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
    }

    setNotification((prev) => ({
      ...prev,
      visible: false,
    }));
  }, []);

  useEffect(() => {
    if (typeof window.gemini?.getSettings !== 'function') return;

    window.gemini.getSettings().then(setGeminiSettings).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (isSettingsOpen) {
      setIsConfirmingLogout(false);
    }
  }, [isSettingsOpen]);

  useEffect(() => {
    return () => {
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (!dateEditedRef.current) {
        setDate(getTodayStr());
      }

      if (!timeEditedRef.current) {
        setTime(getCurrentTimeStr());
      }

      setAssistantExampleIndex((index) => (index + 1) % assistantExamples.length);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [assistantExamples.length]);

  async function handleSaveGeminiKey() {
    if (!settingsKey.trim() || settingsBusy) return;

    setSettingsBusy(true);
    setSettingsError('');

    try {
      const result = await window.gemini.saveKey(settingsKey.trim());

      if (!result.success || !result.settings) {
        setSettingsError(result.error || 'Gemini key could not be saved.');
        return;
      }

      setGeminiSettings(result.settings);
      setSettingsKey('');
    } catch {
      setSettingsError('Gemini key could not be saved.');
    } finally {
      setSettingsBusy(false);
    }
  }

  async function handleRemoveGeminiKey() {
    if (settingsBusy) return;

    setSettingsBusy(true);
    setSettingsError('');

    try {
      const result = await window.gemini.removeKey();

      if (!result.success || !result.settings) {
        setSettingsError(result.error || 'Gemini key could not be removed.');
        return;
      }

      setGeminiSettings(result.settings);
      setSettingsKey('');
    } catch {
      setSettingsError('Gemini key could not be removed.');
    } finally {
      setSettingsBusy(false);
    }
  }

  async function handleToggleAssistant() {
    if (settingsBusy) return;

    setSettingsBusy(true);
    setSettingsError('');

    try {
      const result = await window.gemini.setEnabled(!geminiSettings.enabled);

      if (!result.success || !result.settings) {
        setSettingsError(result.error || 'AI Assistant setting could not be updated.');
        return;
      }

      setGeminiSettings(result.settings);
    } catch {
      setSettingsError('AI Assistant setting could not be updated.');
    } finally {
      setSettingsBusy(false);
    }
  }

  async function handleAssistantSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!assistantPrompt.trim()) return;

    setIsThinking(true);
    setAssistantResponse('');
    setAssistantIntent(null);

    try {
      const now = new Date();
      const result = await window.gemini.generate(assistantPrompt.trim(), {
        currentDate: now.toLocaleDateString('en-CA'),
        currentTime: now.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        chats: chats.map(({ id, name }) => ({ id, name })),
      });

      setAssistantResponse(
        result.success
          ? result.intent?.action === 'clarify'
            ? result.intent.clarification
            : ''
          : result.errorCode === 'quota'
            ? 'AI is temporarily unavailable\nDaily AI limit reached. Please try again later.'
            : 'Something went wrong\nPlease try again.'
      );
      setAssistantIntent(
        result.success && result.intent?.action === 'schedule'
          ? result.intent
          : null
      );
    } catch {
      setAssistantResponse('Something went wrong\nPlease try again.');
    } finally {
      setIsThinking(false);
    }
  }

  useEffect(() => {
    const loadedChats = loadChats();
    const hidden = loadHiddenChats();

    const visibleChats = loadedChats.filter(
      (chat) => !hidden.includes(chat.id)
    );

    setChats(visibleChats);

    if (visibleChats.length > 0) {
      setSelectedChat(visibleChats[0]);
    }

    setUpcoming(loadUpcoming());
    setSent(loadSent());

    let mounted = true;

    window.telegram.getAuthState()
      .then((authResult) => {
        if (!mounted) return;

        if (!authResult.success || !authResult.authState) {
          throw new Error(authResult.error || 'Unable to read Telegram auth state.');
        }

        const authState = authResult.authState;
        const hasSession = authState.hasSession;

        setSignedOut(authState.signedOut);
        setConnected(authState.connected);
        setReturningUserName(authState.userName || '');

        if (!hasSession || authState.signedOut) {
          setConnecting(false);
          setConnectionResolved(true);
          return;
        }

        return window.telegram.connect().then((result) => {
          if (!mounted) return;

          setConnecting(false);
          setConnected(result.success);
          setConnectionResolved(true);

          if (!result.success) {
            setAuthError(result.error || 'Saved session could not be connected.');
          }
        });
      })
      .catch((error) => {
        if (!mounted) return;

        setConnecting(false);
        setConnected(false);
        setConnectionResolved(true);
        setAuthError(
          error instanceof Error
            ? error.message
            : 'Unable to read connection settings.'
        );
      });

    return () => {
      mounted = false;
    };
  }, [showNotification]);

  useEffect(() => {
    if (typeof window.telegram?.onStatus !== 'function') return;

    const handleStatus = (status: unknown) => {
      if (typeof status === 'object' && status !== null) {
        const value = status as {
          connected?: boolean;
          status?: string;
          error?: string;
        };

        if (typeof value.connected === 'boolean') {
          setConnected(value.connected);
        }

        if (value.status === 'connected') {
          setConnected(true);
          setConnecting(false);
          setConnectionResolved(true);
        }

          if (value.status === 'reauth_required') {
            setConnected(false);
            setConnecting(false);
            setConnectionResolved(true);
            setAuthError(value.error || 'Telegram session expired. Please sign in again.');
          }

        if (
          value.status === 'disconnected' ||
          value.status === 'offline' ||
          value.status === 'error'
        ) {
          setConnected(false);
          setConnecting(false);
          setConnectionResolved(true);
        }
      }

      if (typeof status === 'string') {
        if (status === 'connected') {
          setConnected(true);
          setConnecting(false);
          setConnectionResolved(true);
        }

        if (
          status === 'disconnected' ||
          status === 'offline' ||
          status === 'error'
        ) {
          setConnected(false);
          setConnecting(false);
          setConnectionResolved(true);
        }
      }
    };

    window.telegram.onStatus(handleStatus);
  }, []);

  useEffect(() => {
    if (!connected) return;

    window.telegram
      .getChats()
      .then((result) => {
        if (!result.success || !result.chats) return;

        const hidden = loadHiddenChats();

        const telegramChats: Chat[] = result.chats.map((chat) => ({
          id: String(chat.id),
          name: chat.name,
        }));

        const visibleChats = telegramChats.filter(
          (chat) => !hidden.includes(chat.id)
        );

        setChats(visibleChats);
        saveChats(visibleChats);

        setSelectedChat((current) => {
          if (current) {
            const stillExists = visibleChats.find(
              (chat) => chat.id === current.id
            );

            if (stillExists) {
              return stillExists;
            }
          }

          return visibleChats[0] || null;
        });
      })
      .catch(() => {
        // Keep locally saved chats if Telegram chat loading fails.
      });
  }, [connected]);

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

  function handleAddChat(chat: Chat) {
    const exists = chats.some((c) => c.id === chat.id);

    if (!exists) {
      const updated = [...chats, chat];

      setChats(updated);
      saveChats(updated);

      const hidden = loadHiddenChats().filter(
        (id) => id !== chat.id
      );

      saveHiddenChats(hidden);
    }

    setSelectedChat(chat);
  }

  function handleRemoveChat(chat: Chat) {
    setRemoveModal({
      show: true,
      chat,
    });
  }

  function confirmRemoveChat() {
    if (!removeModal.chat) return;

    const chatToRemove = removeModal.chat;
    const hidden = loadHiddenChats();

    if (!hidden.includes(chatToRemove.id)) {
      saveHiddenChats([...hidden, chatToRemove.id]);
    }

    const updated = chats.filter(
      (chat) => chat.id !== chatToRemove.id
    );

    setChats(updated);
    saveChats(updated);

    if (selectedChat?.id === chatToRemove.id) {
      setSelectedChat(updated.length > 0 ? updated[0] : null);
    }

    setRemoveModal({
      show: false,
      chat: null,
    });
  }

  function handleSchedule(assistantSchedule?: {
    chatId: string;
    message: string;
    date: string;
    time: string;
  }) {
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

    const whenISO = whenDate.toISOString();
    const targetTimestamp = Math.floor(
      whenDate.getTime() / 1000
    );

    const chatId = scheduleChat.id;
    const chatName = scheduleChat.name;
    const text = scheduleMessage;
    const operationId = uid();

    const pendingMessage = createPendingSchedule({
      operationId,
      chatId,
      chatName,
      text,
      when: whenISO,
      createdAt: new Date().toISOString(),
    });

    const updated = [...upcoming, pendingMessage];
    setUpcoming(updated);
    saveUpcoming(updated);

    window.telegram
      .schedule({
        chatId,
        message: text,
        targetTimestamp,
      })
      .then((result) => {
        setScheduling(false);


        if (result.success) {
          const telegramMessageId =
            result.telegramMessageId ?? result.id;

          setUpcoming((current) => {
            const updated = applyScheduleResult(current, operationId, {
              success: true,
              telegramMessageId,
            });

            saveUpcoming(updated);
            return updated;
          });

          if (result.confirmed) {
            setRevealingId(operationId);

            window.setTimeout(() => {
              setUpcoming((current) => {
                const confirmed = current.map((item) =>
                  item.operationId === operationId
                    ? { ...item, status: 'confirmed' as const }
                    : item
                );

                saveUpcoming(confirmed);
                return confirmed;
              });
              setRevealingId(null);
            }, 4500);
          }

          setMessage('');
          setAssistantPrompt('');
          setAssistantResponse('');
          setAssistantIntent(null);

          setSuccessPulse(true);

          window.setTimeout(() => {
            setSuccessPulse(false);
          }, 1500);
        } else {
          showNotification(
            result.error || 'Failed to schedule message.',
            'error',
            'Error'
          );
        }
      })
      .catch((error) => {
        setScheduling(false);

        showNotification(
          error instanceof Error
            ? error.message
            : 'Network error while scheduling.',
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

    window.telegram
      .send(msg.chatId, msg.text)
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

  function handleDeleteMessage(msg: ScheduledMessage) {
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
          .catch(() => ({
            success: false,
          }))
      )
    ).then(() => {
      setUpcoming([]);
      saveUpcoming([]);

      showNotification(
        'All upcoming cancelled.',
        'info',
        'Cleared'
      );
    });
  }

  async function handleTelegramAuth() {
    setAuthBusy(true);
    setAuthError('');

    try {
      const result = await window.telegram.login({
        phoneNumber,
        phoneCode: authStep === 'phone' ? undefined : phoneCode,
        password: authStep === 'password' ? twoFactorPassword : undefined,
      });

      if (!result.success) {
        const error = result.error || 'Authorization failed.';

        if (
          authStep === 'code' &&
          /password|2fa|session_password_needed/i.test(error)
        ) {
          setAuthStep('password');
          setAuthError('Enter your Telegram 2FA password to continue.');
        } else {
          setAuthError(error);
        }

        return;
      }

      if (result.requiresPassword || result.nextStep === 'password') {
        setAuthStep('password');
        setAuthError('Enter your Telegram 2FA password to continue.');
        return;
      }

      if (result.requiresCode || result.nextStep === 'code') {
        setAuthStep('code');
        return;
      }

      setConnecting(false);
      setConnected(true);
      setSignedOut(false);
      setShowAuthForm(false);
      setAuthError('');
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : 'Authorization failed.'
      );
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleDisconnect() {
    setAuthBusy(true);
    setAuthError('');

    try {
      const result = await window.telegram.signOutKeepSession();

      if (!result.success) {
        setAuthError(result.error || 'Unable to disconnect account.');
        return;
      }

      setConnected(false);
      setSignedOut(true);
      setShowAuthForm(false);
      setReturningUserName(result.authState?.userName || returningUserName);
      setIsConfirmingLogout(false);
      setIsSettingsOpen(false);
      setChats([]);
      setSelectedChat(null);
      saveChats([]);
      setAuthStep('phone');
      setPhoneCode('');
      setTwoFactorPassword('');
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : 'Unable to disconnect account.'
      );
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleWelcomeBack() {
    if (authBusy) return;

    setAuthBusy(true);
    setConnecting(true);
    setAuthError('');

    try {
      const result = await window.telegram.welcomeBack();

      if (!result.success || !result.authState) {
        setAuthError(result.error || 'Saved Telegram session could not be restored.');
        return;
      }

      setSignedOut(result.authState.signedOut);
      setConnected(result.authState.connected);
      setShowAuthForm(false);
      setReturningUserName(result.authState.userName || returningUserName);
      setConnectionResolved(true);
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : 'Saved Telegram session could not be restored.'
      );
    } finally {
      setConnecting(false);
      setAuthBusy(false);
    }
  }

  async function handleForgetAccount() {
    if (authBusy) return;

    setAuthBusy(true);
    setAuthError('');

    try {
      const result = await window.telegram.forgetAccount();

      if (!result.success || !result.authState) {
        setAuthError(result.error || 'Telegram account could not be removed.');
        return;
      }

      setConnected(false);
      setSignedOut(false);
      setReturningUserName('');
      setIsConfirmingLogout(false);
      setChats([]);
      setSelectedChat(null);
      saveChats([]);
      setShowAuthForm(false);
      setAuthStep('phone');
      setPhoneCode('');
      setTwoFactorPassword('');
      setConnectionResolved(true);
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : 'Telegram account could not be removed.'
      );
    } finally {
      setAuthBusy(false);
    }
  }

  if (isSettingsOpen) {
    return (
      <SettingsView
        onClose={() => {
          setShowAuthForm(false);
          setIsSettingsOpen(false);
        }}
        geminiSettings={geminiSettings}
        settingsKey={settingsKey}
        settingsBusy={settingsBusy}
        settingsError={settingsError}
        onSettingsKeyChange={setSettingsKey}
        onSaveGeminiKey={handleSaveGeminiKey}
        onRemoveGeminiKey={handleRemoveGeminiKey}
        onToggleAssistant={handleToggleAssistant}
      />
    );
  }

  return (
    <>
      <div className={`connection-spinner ${connecting ? 'show' : ''}`}>
        <div className="connection-spinner-ring" />
      </div>

      <Notification
        message={notification.message}
        type={notification.type}
        title={notification.title}
        visible={notification.visible}
        onClose={closeNotification}
      />

      <ChatRemoveModal
        show={removeModal.show}
        chatName={removeModal.chat?.name || ''}
        onConfirm={confirmRemoveChat}
        onCancel={() =>
          setRemoveModal({
            show: false,
            chat: null,
          })
        }
      />

      <div className="app">
        <header className={`topbar ${!connected ? 'is-login-topbar' : ''}`}>
          <div className="topbar-identity">
            <div className="brand">
              AWAITMSG
            </div>
          </div>

          <div className="topbar-actions">
            {connected && (
              <div className="logout-action-group">
                <button
                  className="account-action"
                  onClick={() => {
                    setIsConfirmingLogout((current) => !current);
                  }}
                  disabled={authBusy}
                  title="Sign out"
                  aria-label="Sign out"
                  aria-expanded={isConfirmingLogout}
                >
                  <span className="action-icon" aria-hidden="true">↪︎</span>
                  <span className="action-label">Sign out</span>
                </button>

                {isConfirmingLogout && (
                  <div className="logout-confirmation" role="dialog" aria-label="Confirm log out">
                    <strong className="logout-confirmation-title">Sign out?</strong>
                    <div className="logout-choice-list" role="radiogroup" aria-label="Sign out preference">
                      <button
                        type="button"
                        className="logout-choice"
                        onClick={handleDisconnect}
                        disabled={authBusy}
                      >
                        Remember me
                      </button>
                      <button
                        type="button"
                        className="logout-choice"
                        onClick={handleForgetAccount}
                        disabled={authBusy}
                      >
                        Forget me
                      </button>
                    </div>
                    <div className="logout-confirmation-actions">
                      <button
                        type="button"
                        className="logout-confirmation-action"
                        onClick={() => {
                          setIsConfirmingLogout(false);
                        }}
                        disabled={authBusy}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {connected && (
              <button
                type="button"
                className="settings-action"
                onClick={() => {
                  setShowAuthForm(false);
                  setIsConfirmingLogout(false);
                  setIsSettingsOpen(true);
                }}
                title="Settings"
                aria-label="Settings"
              >
                <span className="action-icon" aria-hidden="true">
                  <Settings size={16} strokeWidth={1.8} />
                </span>
                <span className="action-label">Settings</span>
              </button>
            )}
          </div>
        </header>

        {!connectionResolved ? (
          <div className="connection-stage" aria-hidden="true" />
        ) : !connected ? (
          <section className={`auth-panel ${showAuthForm ? 'is-auth-open' : ''}`}>
            <span className="auth-version">Version 2.1.7</span>
            <div className="auth-intro">
              <div className="auth-hero-copy" aria-label="AwaitMsg sign in intro">
                <span className="auth-hero-line auth-hero-line-main">LET THE MSG</span>
                <span className="auth-hero-line auth-hero-line-sub">WAIT.</span>
              </div>

              <button
                type="button"
                className="auth-cta"
                aria-label="Continue with Telegram"
                onClick={() => {
                  setShowAuthForm((current) => !current);
                  setAuthStep('phone');
                  setAuthError('');
                }}
              >
                <span>CONTINUE</span>
                <span className="auth-cta-arrow" aria-hidden="true">→</span>
                <span>TELEGRAM</span>
              </button>

              <div className={`auth-form ${showAuthForm ? 'is-visible' : ''}`}>
              {authStep === 'phone' && (
                <div className="field">
                  <label>Phone</label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(event) => setPhoneNumber(event.target.value)}
                    placeholder="1 555 000 0000"
                    autoComplete="tel"
                  />
                </div>
              )}

              {authStep !== 'phone' && (
                <div className="field">
                  <label>Login code</label>
                  <input
                    type="text"
                    value={phoneCode}
                    onChange={(event) => setPhoneCode(event.target.value)}
                    placeholder="The code sent to your phone"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                </div>
              )}

              {authStep === 'password' && (
                <div className="field">
                  <label>Two-step password</label>
                  <input
                    type="password"
                    value={twoFactorPassword}
                    onChange={(event) => setTwoFactorPassword(event.target.value)}
                    placeholder="Your two-step password"
                    autoComplete="current-password"
                  />
                </div>
              )}

              {authError && <p className="auth-error">{authError}</p>}

              <button
                className="action-button"
                onClick={handleTelegramAuth}
                disabled={authBusy || (authStep === 'phone' ? !phoneNumber.trim() : !phoneCode.trim())}
              >
                {authBusy
                  ? 'Connecting…'
                  : authStep === 'phone'
                    ? 'Sign in'
                    : authStep === 'password'
                      ? 'Verify and connect'
                      : 'Verify code'}
              </button>

              {authStep !== 'phone' && (
                <button
                  className="auth-back-button"
                  onClick={() => {
                    setAuthStep('phone');
                    setPhoneCode('');
                    setTwoFactorPassword('');
                    setAuthError('');
                  }}
                  disabled={authBusy}
                >
                  Start over with another phone
                </button>
              )}
              </div>
            </div>
            {signedOut && (
              <aside className="returning-user-panel" aria-label="Returning user">
                <div className="returning-user-copy">
                  <span className="returning-user-greeting">WELCOME BACK,</span>
                  <button
                    type="button"
                    className="returning-user-name"
                    onClick={handleWelcomeBack}
                    disabled={authBusy}
                  >
                    {returningUserName || 'Telegram account'}
                  </button>
                  <div className="returning-user-actions">
                    <button
                      type="button"
                      onClick={handleForgetAccount}
                      disabled={authBusy}
                    >
                      Not you?
                    </button>
                  </div>
                </div>
              </aside>
            )}
          </section>
        ) : (
          <>
        <section
          className={`hero ${assistantIntent ? 'has-assistant-confirmation' : ''}`}
          aria-label="AwaitMsg assistant"
        >
          <div className="hero-slogan">LET IT WAIT.</div>
          <div className="assistant-visual-slot">
          {!geminiSettings.enabled && (
            <div className="hero-subcopy">Message, ready when the moment arrives.</div>
          )}
          {geminiSettings.enabled ? (
            <>
            <div className="assistant-mark" aria-hidden="true">✦</div>
            <div className="assistant-label">AI ASSISTANT</div>

              <form
                className={`assistant-form ${isThinking ? 'is-thinking' : ''} ${
                  assistantResponse || assistantIntent ? 'response-ready' : ''
                }`}
                onSubmit={handleAssistantSubmit}
              >
            <textarea
              value={assistantPrompt}
              onChange={(event) => setAssistantPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={assistantExamples[assistantExampleIndex]}
              aria-label="Ask AwaitMsg Assistant"
              title="Describe the task — AI will help you write the message and schedule it."
              rows={2}
              lang="ru"
              spellCheck
            />
            <button
              type="submit"
              aria-label="Send to AI Assistant"
              title="Send request to AI Assistant"
            >
              →
            </button>
              </form>

              {isThinking && (
                <div className="assistant-thinking-dots" aria-label="Assistant is thinking">
                  <span />
                  <span />
                  <span />
                </div>
              )}

              {displayedAssistantResponse && (
                <p className="assistant-response" aria-live="polite">
                  {displayedAssistantResponse}
                </p>
              )}

              {assistantIntent && (
                <div className="assistant-response assistant-confirmation" aria-live="polite">
              <div className="assistant-confirmation-detail">
                <strong>{assistantIntent.chat}</strong>
                <span>{assistantIntent.date} · {assistantIntent.time}</span>
                <span>{assistantIntent.message}</span>
              </div>
              <div className="assistant-confirmation-actions">
                <button
                  type="button"
                  onClick={() => {
                    setAssistantIntent(null);
                    setAssistantResponse('');
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const chat = chats.find((item) => item.name === assistantIntent.chat);

                    if (!chat) {
                      showNotification('Chat is no longer available.', 'error', 'Cannot schedule');
                      return;
                    }

                    handleSchedule({
                      chatId: chat.id,
                      message: assistantIntent.message,
                      date: assistantIntent.date,
                      time: assistantIntent.time,
                    });
                  }}
                >
                  Send →
                </button>
              </div>
                </div>
              )}
            </>
          ) : null}
          </div>
        </section>

        <section className="composer">
          <div className="field">
            <label>Chat</label>

            <ChatPicker
              chats={chats}
              selectedChat={selectedChat}
              onSelect={setSelectedChat}
              onAddChat={handleAddChat}
              onRemoveChat={handleRemoveChat}
              onError={(msg, title) =>
                showNotification(msg, 'error', title)
              }
            />
          </div>

          <div className="field message-field">
            <label>Your message</label>

            <div className="message-input-wrap">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What should the message say when the moment arrives?"
                maxLength={4096}
                lang="ru"
                spellCheck
              />
            </div>
          </div>

          <div className="field">
            <label>Your time</label>

            <div className="schedule-row">
              <div className="moment-controls">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    dateEditedRef.current = true;
                    setDate(e.target.value);
                  }}
                  onPointerDown={(e) => {
                    if (openPickerRef.current === 'date') {
                      e.currentTarget.blur();
                      openPickerRef.current = null;
                    } else {
                      openPickerRef.current = 'date';
                    }
                  }}
                  onBlur={() => {
                    if (openPickerRef.current === 'date') {
                      openPickerRef.current = null;
                    }
                  }}
                />

                <input
                  type="time"
                  value={time}
                  onChange={(e) => {
                    timeEditedRef.current = true;
                    setTime(e.target.value);
                  }}
                  onPointerDown={(e) => {
                    if (openPickerRef.current === 'time') {
                      e.currentTarget.blur();
                      openPickerRef.current = null;
                    } else {
                      openPickerRef.current = 'time';
                    }
                  }}
                  onBlur={() => {
                    if (openPickerRef.current === 'time') {
                      openPickerRef.current = null;
                    }
                  }}
                />
              </div>
            </div>

          </div>

          <button
            className={`action-button ${
              successPulse ? 'schedule-success' : ''
            }`}
            onClick={() => handleSchedule()}
            disabled={scheduling}
          >
            {scheduling
              ? 'Scheduling…'
              : successPulse
                ? 'SEALED'
                : 'Seal it'}
          </button>
        </section>

        <section className="messages-panel-wrapper">
          <MessagesPanel
            upcoming={upcoming}
            sent={sent}
            assistantText={displayedAssistantResponse}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onCancel={handleCancelMessage}
            onSendNow={handleSendNow}
            onDelete={handleDeleteMessage}
            onClearSent={handleClearSent}
            onClearAll={handleClearAll}
            cancelingIds={cancelingIds}
            sendingIds={sendingIds}
            revealingId={revealingId}
          />
        </section>


        <footer>
          <span>Version 2.1.7</span>
          <span>{getTimezoneLabel()}</span>
        </footer>
          </>
        )}
      </div>
    </>
  );
}

   export default App;