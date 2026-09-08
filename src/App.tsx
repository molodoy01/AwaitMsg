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

    window.telegram
      .connect()
      .then((result) => {
        if (!mounted) return;

        setConnecting(false);
        setConnected(result.success);

        if (!result.success) {
          showNotification(
            result.error || 'Failed to connect. Some features may not work.',
            'error',
            'Connection error'
          );
        }
      })
      .catch((error) => {
        if (!mounted) return;

        setConnecting(false);
        setConnected(false);

        showNotification(
          error instanceof Error
            ? error.message
            : 'Failed to connect. Some features may not work.',
          'error',
          'Connection error'
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
          }, 1500);


          showNotification(
            `Message scheduled to ${chatName}`,
            'success',
            'Scheduled'
          );
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
        'Cannot cancel'
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
            'Message cancelled.',
            'info',
            'Cancelled'
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
          window.setTimeout(() => setRevealingId(null), 3500);

          showNotification(
            `Sent to ${msg.chatName}.`,
            'success',
            'Sent'
          );
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
            TimeCaps <span>2.0</span>
          </div>

          <div className="status">
            <i />
            {connected ? 'Connected' : 'Offline'}
          </div>
        </header>

        <section className="hero">
          <h1>
            Scheduled.
            <br />
            Sealed.
            <br />
            Sent.
          </h1>

          <p>
            Schedule messages to be sent at the perfect moment.
            Set it, forget it, and let time do the rest.
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

          <div className="field">
            <label>Message</label>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write your message…"
              maxLength={4096}
            />
          </div>

          <div className="field">
            <label>
              Schedule
              <span className="tz-badge">
                {getTimezoneLabel()}
              </span>
            </label>

            <div className="schedule-row">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />

              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
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
                ? '✓ Scheduled'
                : 'Schedule Message'}
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
          <span>TimeCaps 2.0</span>
          <span>Local archive</span>
        </footer>
      </div>
    </>
  );
}

   export default App;