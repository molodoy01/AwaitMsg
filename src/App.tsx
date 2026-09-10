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
import { Notification } from '@/components/Notification';
import { ChatRemoveModal } from '@/components/ChatRemoveModal';
import { ChatPicker } from '@/components/ChatPicker';
import { MessagesPanel } from '@/components/MessagesPanel';
import { LogOut, Settings as SettingsIcon } from 'lucide-react';

type AssistantIntent = NonNullable<
  Awaited<ReturnType<Window['gemini']['generate']>>['intent']
>;
type GeminiSettings = Awaited<ReturnType<Window['gemini']['getSettings']>>;

const DEV_MODE_MOCK_CHATS: Chat[] = [
  { id: 'dev-chat-1', name: 'Team Updates' },
  { id: 'dev-chat-2', name: 'Family Circle' },
  { id: 'dev-chat-3', name: 'Design Feedback' },
];

const DEV_MODE_MOCK_UPCOMING: ScheduledMessage[] = [
  {
    id: 'dev-upcoming-1',
    chatId: 'dev-chat-1',
    chatName: 'Team Updates',
    text: 'Morning standup reminder for the product team.',
    when: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    status: 'scheduled',
  },
];

const DEV_MODE_MOCK_SENT: ScheduledMessage[] = [
  {
    id: 'dev-sent-1',
    chatId: 'dev-chat-2',
    chatName: 'Family Circle',
    text: 'Dinner reservation reminder for tonight.',
    when: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    status: 'sent',
    sentAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  },
];

function App() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [message, setMessage] = useState('');
  const [assistantPrompt, setAssistantPrompt] = useState('');
  const [assistantResponse, setAssistantResponse] = useState('');
  const [assistantIntent, setAssistantIntent] = useState<AssistantIntent | null>(null);
  const [assistantExampleIndex, setAssistantExampleIndex] = useState(0);
  const [isThinking, setIsThinking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const [connecting, setConnecting] = useState(true);
  const [authStep, setAuthStep] = useState<'phone' | 'code' | 'password'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [twoFactorPassword, setTwoFactorPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
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
  const isDevMode = Boolean(window.appConfig?.devMode);

  const assistantExamples = [
    'Tell me what to send and when — I’ll help you schedule it.',
    'Напиши Саше завтра в 10, чтобы он не забыл документы.',
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
    window.gemini.getSettings().then(setGeminiSettings).catch(() => undefined);
  }, []);

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
    if (isDevMode) {
      const mockChats = DEV_MODE_MOCK_CHATS;
      const storedUpcoming = loadUpcoming();
      const storedSent = loadSent();

      setChats(mockChats);
      setSelectedChat(mockChats[0] ?? null);
      setUpcoming(storedUpcoming.length > 0 ? storedUpcoming : DEV_MODE_MOCK_UPCOMING);
      setSent(storedSent.length > 0 ? storedSent : DEV_MODE_MOCK_SENT);
      setConnected(true);
      setConnecting(false);
      setAuthError('');
      return;
    }

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

    window.telegram.getConfig()
      .then((configResult) => {
        if (!mounted) return;

        const hasSession = Boolean(configResult.config?.hasSession);

        if (!configResult.success || !hasSession) {
          setConnecting(false);
          return;
        }

        return window.telegram.connect().then((result) => {
          if (!mounted) return;

          setConnecting(false);
          setConnected(result.success);

          if (!result.success) {
            setAuthError(result.error || 'Saved session could not be connected.');
          }
        });
      })
      .catch((error) => {
        if (!mounted) return;

        setConnecting(false);
        setConnected(false);
        setAuthError(
          error instanceof Error
            ? error.message
            : 'Unable to read connection settings.'
        );
      });

    return () => {
      mounted = false;
    };
  }, [isDevMode, showNotification]);

  useEffect(() => {
    const handleStatus = (status: unknown) => {
      if (typeof status === 'object' && status !== null) {
        const value = status as {
          connected?: boolean;
          status?: string;
        };

        if (typeof value.connected === 'boolean') {
          setConnected(value.connected);
        }

        if (value.status === 'connected') {
          setConnected(true);
          setConnecting(false);
        }

        if (
          value.status === 'disconnected' ||
          value.status === 'offline' ||
          value.status === 'error'
        ) {
          setConnected(false);
          setConnecting(false);
        }
      }

      if (typeof status === 'string') {
        if (status === 'connected') {
          setConnected(true);
          setConnecting(false);
        }

        if (
          status === 'disconnected' ||
          status === 'offline' ||
          status === 'error'
        ) {
          setConnected(false);
          setConnecting(false);
        }
      }
    };

    window.telegram.onStatus(handleStatus);
  }, []);

  useEffect(() => {
    if (!connected || isDevMode) return;

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
  }, [connected, isDevMode]);

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
      window.setTimeout(() => setRevealingId(null), 3500);
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

    if (isDevMode) {
      const newMessageId = uid();
      const newMsg: ScheduledMessage = {
        id: newMessageId,
        chatId,
        chatName,
        text,
        when: whenISO,
        createdAt: new Date().toISOString(),
        status: 'scheduled',
      };

      const updated = [...upcoming, newMsg];

      setUpcoming(updated);
      saveUpcoming(updated);
      setMessage('');
      setAssistantPrompt('');
      setAssistantResponse('');
      setAssistantIntent(null);
      setScheduling(false);
      setSuccessPulse(true);

      window.setTimeout(() => {
        setSuccessPulse(false);
      }, 3500);
      return;
    }

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

          const newMessageId = uid();

          const newMsg: ScheduledMessage = {
            id: newMessageId,
            chatId,
            chatName,
            text,
            when: whenISO,
            createdAt: new Date().toISOString(),
            status: 'scheduled',
            telegramMessageId,
          };

          const updated = [...upcoming, newMsg];

          setUpcoming(updated);
          saveUpcoming(updated);

          if (result.confirmed) {
            setRevealingId(newMessageId);

            window.setTimeout(() => {
              setUpcoming((current) => {
                const confirmed = current.map((item) =>
                  item.id === newMessageId
                    ? { ...item, status: 'confirmed' as const }
                    : item
                );

                saveUpcoming(confirmed);
                return confirmed;
              });
              setRevealingId(null);
            }, 3500);
          }

          setMessage('');
          setAssistantPrompt('');
          setAssistantResponse('');
          setAssistantIntent(null);

          setSuccessPulse(true);

          window.setTimeout(() => {
            setSuccessPulse(false);
          }, 3500);
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
    if (isDevMode) {
      const updated = upcoming.filter((item) => item.id !== msg.id);

      setUpcoming(updated);
      saveUpcoming(updated);

      showNotification(
        'Message removed from the preview list.',
        'info',
        'Unscheduled'
      );
      return;
    }

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
    if (isDevMode) {
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
      window.setTimeout(() => setRevealingId(null), 3500);
      return;
    }

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
          window.setTimeout(() => setRevealingId(null), 3500);
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
    if (
      msg.status === 'scheduled' ||
      msg.status === 'confirmed'
    ) {
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
    if (isDevMode) {
      setUpcoming([]);
      saveUpcoming([]);

      showNotification(
        'All upcoming cleared from the preview list.',
        'info',
        'Cleared'
      );
      return;
    }

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
      const result = await window.telegram.clearSession();

      if (!result.success) {
        setAuthError(result.error || 'Unable to disconnect account.');
        return;
      }

      setConnected(false);
      setSettingsOpen(false);
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
        <header className="topbar">
          <div className="topbar-identity">
            <div className="status">
              <span className="status-mark" aria-hidden="true">
                <i />
              </span>
            </div>

            <div className="brand">
              AWAITMSG
            </div>
          </div>

          <div className="topbar-actions">
            <button
              className="settings-action"
              onClick={() => {
                setSettingsError('');
                setSettingsOpen((open) => !open);
              }}
              title="Settings"
              aria-label="Settings"
            >
              <SettingsIcon size={14} strokeWidth={1.7} />
            </button>

            {connected && !isDevMode && (
              <button
                className="account-action"
                onClick={handleDisconnect}
                disabled={authBusy}
                title="Log out"
                aria-label="Log out"
              >
                <LogOut size={14} strokeWidth={1.7} />
              </button>
            )}
          </div>
        </header>

        {settingsOpen ? (
          <section className="settings-panel" aria-label="Settings">
            <div className="settings-heading">
              <div>
                <div className="settings-kicker">Settings</div>
                <h1>Make it yours.</h1>
              </div>
              <button
                className="settings-close"
                type="button"
                onClick={() => setSettingsOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="settings-section">
              <div className="settings-section-label">ABOUT</div>
              <p>AwaitMsg keeps your Telegram messages ready for the right moment.</p>
              <div className="settings-meta">
                <span>Version 2.1.0</span>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-label">AI ASSISTANT</div>
              <p>Create scheduled messages from natural language.</p>
              <button
                className={`settings-toggle ${geminiSettings.enabled ? 'is-on' : ''}`}
                type="button"
                onClick={handleToggleAssistant}
                disabled={settingsBusy}
                aria-pressed={geminiSettings.enabled}
              >
                <span>AI Assistant</span>
                <strong>{geminiSettings.enabled ? 'ON' : 'OFF'}</strong>
              </button>

              <div className="settings-key-group">
                <div className="settings-subsection-label">Gemini API Key</div>
                <p>Your key, your quota.</p>

                {geminiSettings.hasKey && !settingsKey ? (
                  <div className="settings-key-saved">
                    <span>{geminiSettings.maskedKey}</span>
                    <div className="settings-key-actions">
                      <button type="button" onClick={() => setSettingsKey(' ')}>
                        Change key
                      </button>
                      <button type="button" onClick={handleRemoveGeminiKey} disabled={settingsBusy}>
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="settings-key-entry">
                    <input
                      type="password"
                      value={settingsKey.trim()}
                      onChange={(event) => setSettingsKey(event.target.value)}
                      placeholder="Paste your Gemini API key"
                      autoComplete="off"
                    />
                    <button type="button" onClick={handleSaveGeminiKey} disabled={!settingsKey.trim() || settingsBusy}>
                      Save key
                    </button>
                  </div>
                )}

                <a
                  className="settings-link"
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                >
                  Get API key →
                </a>
              </div>
              {settingsError && <p className="settings-error">{settingsError}</p>}
            </div>
          </section>
        ) : !connected && !connecting ? (
          <section className="auth-panel">
            <div className="auth-kicker">Your message</div>
            <h1>Connect your space.</h1>
            <p className="auth-copy">
              Bring your account in and keep every message on schedule.
            </p>

            <div className="auth-form">
              {authStep === 'phone' && (
                <div className="field">
                  <label>Phone</label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(event) => setPhoneNumber(event.target.value)}
                    placeholder="1 555 000 0000"
                    autoComplete="tel"
                    autoFocus
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
                    autoFocus
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
                className="auth-button"
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
          </section>
        ) : (
          <>
        <section className="hero" aria-label="AwaitMsg assistant">
          <div className="hero-slogan">LET’S WAIT.</div>
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
              rows={2}
            />
            <button type="submit" aria-label="Send to AI Assistant">→</button>
              </form>

              {isThinking && (
                <div className="assistant-thinking-dots" aria-label="Assistant is thinking">
                  <span />
                  <span />
                  <span />
                </div>
              )}

              {assistantResponse && (
                <p className="assistant-response" aria-live="polite">
                  {assistantResponse}
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
                  Редактировать
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
                  Отправить →
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
                placeholder="What should be said when the moment arrives?"
                maxLength={4096}
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
            className={`schedule-button ${
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
          <span>AwaitMsg</span>
          <span>{getTimezoneLabel()}</span>
        </footer>
          </>
        )}
      </div>
    </>
  );
}

   export default App;