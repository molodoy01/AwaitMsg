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
import { LogOut } from 'lucide-react';

function App() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [message, setMessage] = useState('');
  const [date, setDate] = useState(getTodayStr());
  const [time, setTime] = useState(getCurrentTimeStr());
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
  const [timelineActive, setTimelineActive] = useState(false);
  const [timelineRun, setTimelineRun] = useState(0);
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

  function startTimelineGlow() {
    setTimelineRun((run) => run + 1);
    setTimelineActive(true);
  }

  useEffect(() => {
    return () => {
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }
    };
  }, []);

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
  }, [showNotification]);

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

  function handleSchedule() {
    if (scheduling) return;

    if (!selectedChat) {
      showNotification(
        'Select a chat first.',
        'warning',
        'No chat selected'
      );
      return;
    }

    if (!message.trim()) {
      showNotification(
        'Message cannot be empty.',
        'warning',
        'Empty message'
      );
      return;
    }

    if (!date || !time) {
      showNotification(
        'Set date and time.',
        'warning',
        'Missing schedule'
      );
      return;
    }

    const whenDate = new Date(`${date}T${time}`);

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
    setTimelineActive(false);

    const whenISO = whenDate.toISOString();
    const targetTimestamp = Math.floor(
      whenDate.getTime() / 1000
    );

    const chatId = selectedChat.id;
    const chatName = selectedChat.name;
    const text = message;

    window.telegram
      .schedule({
        chatId,
        message: text,
        targetTimestamp,
      })
      .then((result) => {
        setScheduling(false);


        if (result.success) {
          startTimelineGlow();

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
          startTimelineGlow();

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
          <div className="brand">
            AWAITMSG
          </div>

          <div className="topbar-actions">
            <div className="status">
              <span className="status-mark" aria-hidden="true">
                <i />
              </span>
              <span className="status-copy">
                <strong>{connected ? 'Connected' : 'Offline'}</strong>
              </span>
            </div>

            {connected && (
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

        {!connected && !connecting ? (
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
        <section className="hero">
          <h1>
            <span className="hero-title-accent">Let it wait.</span>
          </h1>

          <p>
            Messages, ready when the moment arrives.
          </p>
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
                  onChange={(e) => setDate(e.target.value)}
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
                  onChange={(e) => setTime(e.target.value)}
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

            <div className={`future-moment-visual ${timelineActive ? 'is-active' : ''}`}>
              <div className="future-moment-line" aria-label="From this moment to the future">
                <div className="future-moment-prefix" aria-hidden="true">
                  {[0].map((index) => (
                    <span
                      key={index}
                      className="future-moment-dot is-glow"
                      style={{ '--dot-index': index } as React.CSSProperties}
                    />
                  ))}
                </div>
                <span className="future-moment-label">MESSAGE</span>
                <div
                  key={timelineRun}
                  className="future-moment-track"
                  aria-hidden="true"
                >
                  {Array.from({ length: 16 }, (_, offset) => {
                    const index = offset + 1;

                    return (
                      <span
                        key={index}
                        className="future-moment-dot is-glow"
                        style={{ '--dot-index': index } as React.CSSProperties}
                      />
                    );
                  })}
                </div>
                <span className="future-moment-label future-moment-end-label">FUTURE</span>
                <div className="future-moment-suffix" aria-hidden="true">
                  {[17, 18, 19].map((index) => (
                    <span
                      key={index}
                      className="future-moment-dot is-glow"
                      style={{ '--dot-index': index } as React.CSSProperties}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <button
            className={`schedule-button ${
              successPulse ? 'schedule-success' : ''
            }`}
            onClick={handleSchedule}
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