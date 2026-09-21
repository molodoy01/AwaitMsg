import { createPortal } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { CalendarDays, Clock, Eraser, Menu, Paperclip, Send, X } from 'lucide-react';
import { Notification } from '@/components/Notification';
import { ChatRemoveModal } from '@/components/ChatRemoveModal';
import { ChatPicker } from '@/components/ChatPicker';
import { MessagesPanel } from '@/components/MessagesPanel';
import { getTimezoneLabel } from '@/lib/utils';
import type { AssistantIntent } from '@/hooks/useAssistant';
import type { Chat, NotificationState, ScheduledMessage } from '@/types';
import { shouldShowTopbar } from '@/lib/authLayout';

type SchedulePageProps = {
  message: string;
  setMessage: Dispatch<SetStateAction<string>>;
  isSettingsOpen: boolean;
  setIsSettingsOpen: Dispatch<SetStateAction<boolean>>;
  notification: NotificationState;
  closeNotification: () => void;
  connected: boolean;
  signedOut: boolean;
  returningUserName: string;
  connecting: boolean;
  connectionResolved: boolean;
  authStep: 'phone' | 'code' | 'password';
  showAuthForm: boolean;
  phoneNumber: string;
  phoneCode: string;
  twoFactorPassword: string;
  authBusy: boolean;
  authError: string;
  isConfirmingLogout: boolean;
  setIsConfirmingLogout: Dispatch<SetStateAction<boolean>>;
  setShowAuthForm: Dispatch<SetStateAction<boolean>>;
  setAuthStep: Dispatch<SetStateAction<'phone' | 'code' | 'password'>>;
  setPhoneNumber: Dispatch<SetStateAction<string>>;
  setPhoneCode: Dispatch<SetStateAction<string>>;
  setTwoFactorPassword: Dispatch<SetStateAction<string>>;
  setAuthError: Dispatch<SetStateAction<string>>;
  handleTelegramAuth: () => Promise<void>;
  handleDisconnect: () => Promise<void>;
  handleWelcomeBack: () => Promise<void>;
  handleForgetAccount: () => Promise<void>;
  chats: Chat[];
  selectedChat: Chat | null;
  setSelectedChat: Dispatch<SetStateAction<Chat | null>>;
  removeModal: { show: boolean; chat: Chat | null };
  setRemoveModal: Dispatch<SetStateAction<{ show: boolean; chat: Chat | null }>>;
  handleAddChat: (chat: Chat) => void;
  handleRemoveChat: (chat: Chat) => void;
  confirmRemoveChat: () => void;
  assistantPrompt: string;
  setAssistantPrompt: Dispatch<SetStateAction<string>>;
  assistantResponse: string;
  setAssistantResponse: Dispatch<SetStateAction<string>>;
  displayedAssistantResponse: string;
  assistantIntent: AssistantIntent | null;
  setAssistantIntent: Dispatch<SetStateAction<AssistantIntent | null>>;
  assistantExampleIndex: number;
  isThinking: boolean;
  geminiSettings: { enabled: boolean };
  settingsKey: string;
  setSettingsKey: Dispatch<SetStateAction<string>>;
  settingsBusy: boolean;
  settingsError: string;
  assistantExamples: string[];
  handleSaveGeminiKey: () => void;
  handleRemoveGeminiKey: () => void;
  handleToggleAssistant: () => void;
  handleAssistantSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  date: string;
  time: string;
  upcoming: ScheduledMessage[];
  sent: ScheduledMessage[];
  activeTab: 'upcoming' | 'sent';
  scheduling: boolean;
  successPulse: boolean;
  revealingId: string | null;
  cancelingIds: Set<string>;
  sendingIds: Set<string>;
  dateEditedRef: MutableRefObject<boolean>;
  timeEditedRef: MutableRefObject<boolean>;
  openPickerRef: MutableRefObject<'date' | 'time' | null>;
  handleSchedule: (payload?: { chatId: string; message: string; date: string; time: string; attachments?: string[]; silent?: boolean; effect?: string }) => void;
  handleCancelMessage: (message: ScheduledMessage) => void;
  handleSendNow: (message: ScheduledMessage) => void;
  handleDeleteMessage: (message: ScheduledMessage) => void;
  handleClearSent: () => void;
  handleClearAll: () => void;
  setActiveTab: Dispatch<SetStateAction<'upcoming' | 'sent'>>;
  setDate: Dispatch<SetStateAction<string>>;
  setTime: Dispatch<SetStateAction<string>>;
  onOpenSettings: () => void;
  showNotification: (message: string, type: 'error' | 'warning' | 'success' | 'info', title: string) => void;
};

export function SchedulePage(props: SchedulePageProps) {
  const {
    message,
    setMessage,
    notification,
    closeNotification,
    connected,
    signedOut,
    returningUserName,
    connecting,
    connectionResolved,
    authStep,
    showAuthForm,
    phoneNumber,
    phoneCode,
    twoFactorPassword,
    authBusy,
    authError,
    isConfirmingLogout,
    setIsConfirmingLogout,
    setShowAuthForm,
    setAuthStep,
    setPhoneNumber,
    setPhoneCode,
    setTwoFactorPassword,
    setAuthError,
    handleTelegramAuth,
    handleDisconnect,
    handleWelcomeBack,
    handleForgetAccount,
    chats,
    selectedChat,
    setSelectedChat,
    removeModal,
    setRemoveModal,
    handleAddChat,
    handleRemoveChat,
    confirmRemoveChat,
    assistantPrompt,
    setAssistantPrompt,
    assistantResponse,
    setAssistantResponse,
    displayedAssistantResponse,
    assistantIntent,
    setAssistantIntent,
    assistantExampleIndex,
    isThinking,
    geminiSettings,
    assistantExamples,
    handleAssistantSubmit,
    date,
    time,
    scheduling,
    successPulse,
    dateEditedRef,
    timeEditedRef,
    openPickerRef,
    handleSchedule,
    upcoming,
    sent,
    activeTab,
    setDate,
    setTime,
    revealingId,
    cancelingIds,
    sendingIds,
    handleCancelMessage,
    handleSendNow,
    handleDeleteMessage,
    handleClearSent,
    handleClearAll,
    setActiveTab,
    onOpenSettings,
    showNotification,
  } = props;

  const showTopbar = shouldShowTopbar({ connected, signedOut });
  const datePickerRef = useRef<HTMLInputElement>(null);
  const timePickerRef = useRef<SVGSVGElement>(null);
  const timeDisplayRef = useRef<HTMLDivElement>(null);
  const timeMenuRef = useRef<HTMLDivElement>(null);
  const messageOptionsRef = useRef<HTMLDivElement>(null);
  const effectMenuRef = useRef<HTMLDivElement>(null);
  const messageOptionsButtonRef = useRef<HTMLButtonElement>(null);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [messageOptionsOpen, setMessageOptionsOpen] = useState(false);
  const [selectedMessageOption, setSelectedMessageOption] = useState<'silent' | 'effect' | null>(null);
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null);
  const [availableEffects, setAvailableEffects] = useState<Array<{ id: string; emoticon: string; premiumRequired: boolean }>>([]);
  const [effectsLoading, setEffectsLoading] = useState(false);
  const [effectMenuOpen, setEffectMenuOpen] = useState(false);
  const [premiumEffectsOpen, setPremiumEffectsOpen] = useState(false);
  const [manualTime, setManualTime] = useState(time);
  const manualTimeEditedRef = useRef(false);
  const MAX_ATTACHMENTS = 7;
  const [timeMenuPosition, setTimeMenuPosition] = useState({ top: 0, left: 0 });
  const [dateYear, dateMonth, dateDay] = date.split('-');
  const [timeHours, timeMinutes] = time.split(':');
  const [attachments, setAttachments] = useState<Array<{ name: string; path: string }>>([]);
  const [previewAttachmentIndex, setPreviewAttachmentIndex] = useState<number | null>(null);
  const [previewPosition, setPreviewPosition] = useState<{ left: number; top: number } | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedEffect = availableEffects.find((effect) => effect.id === selectedEffectId);
  const premiumEffects = availableEffects.filter((effect) => effect.premiumRequired === true);
  const freeEffects = availableEffects.filter((effect) => effect.premiumRequired !== true);

  const loadAvailableEffects = useCallback(async () => {
    if (!connected) {
      setAvailableEffects([]);
      return [];
    }

    setEffectsLoading(true);

    try {
      const result = await window.telegram.getAvailableEffects();
      if (result.success) {
        const effects = result.effects ?? [];
        setAvailableEffects(effects);
        return effects;
      } else {
        setAvailableEffects([]);
      }
    } catch {
      setAvailableEffects([]);
    } finally {
      setEffectsLoading(false);
    }

    return [];
  }, [connected]);

  useEffect(() => {
    if (!messageOptionsOpen || selectedMessageOption !== 'effect') return;
    void loadAvailableEffects();
  }, [messageOptionsOpen, selectedMessageOption, loadAvailableEffects]);

  const clearPreviewTimer = () => {
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
  };

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    const remainingSlots = MAX_ATTACHMENTS - attachments.length;
    if (remainingSlots <= 0) {
      showNotification(`Можно добавить не больше ${MAX_ATTACHMENTS} вложений.`, 'error', 'Вложения');
      event.target.value = '';
      return;
    }

    const acceptedFiles = files.slice(0, remainingSlots);
    if (acceptedFiles.length < files.length) {
      showNotification(`Можно добавить не больше ${MAX_ATTACHMENTS} вложений.`, 'warning', 'Вложения');
    }

    setAttachments((current) => [
      ...current,
      ...acceptedFiles.map((file) => ({ name: file.name, path: window.telegram.getFilePath(file) })),
    ]);
    event.target.value = '';
  };

  const togglePicker = (kind: 'date', pickerRef: MutableRefObject<HTMLInputElement | null>) => {
    const picker = pickerRef.current;
    if (!picker) return;

    if (openPickerRef.current === kind) {
      picker.blur();
      openPickerRef.current = null;
      return;
    }

    picker.showPicker?.();
    openPickerRef.current = kind;
  };

  useEffect(() => {
    return () => {
      clearPreviewTimer();
    };
  }, []);

  useEffect(() => {
    if (!timePickerOpen) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!timePickerRef.current?.contains(event.target as Node) && !timeMenuRef.current?.contains(event.target as Node)) {
        setTimePickerOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTimePickerOpen(false);
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [timePickerOpen]);

  useEffect(() => {
    if (!messageOptionsOpen) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (
        !messageOptionsRef.current?.contains(event.target as Node)
        && !effectMenuRef.current?.contains(event.target as Node)
        && !messageOptionsButtonRef.current?.contains(event.target as Node)
      ) {
        setMessageOptionsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMessageOptionsOpen(false);
        messageOptionsButtonRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [messageOptionsOpen]);

  useLayoutEffect(() => {
    if (!timePickerOpen) return;

    const updateTimeMenuPosition = () => {
      const trigger = timeDisplayRef.current?.getBoundingClientRect();
      const menu = timeMenuRef.current;
      if (!trigger || !menu) return;

      const centeredLeft = trigger.left + trigger.width / 2 - menu.offsetWidth / 2;
      setTimeMenuPosition({
        top: Math.max(12, trigger.bottom + 6),
        left: Math.max(12, Math.min(centeredLeft, window.innerWidth - menu.offsetWidth - 12)),
      });
    };

    updateTimeMenuPosition();
    window.addEventListener('resize', updateTimeMenuPosition);
    return () => window.removeEventListener('resize', updateTimeMenuPosition);
  }, [timePickerOpen]);

  const openTimePicker = () => {
    if (!manualTimeEditedRef.current) setManualTime(time);
    setTimePickerOpen((current) => !current);
  };

  const updateManualTimePart = (part: 'hours' | 'minutes', value: string) => {
    manualTimeEditedRef.current = true;
    const digits = value.replace(/\D/g, '').slice(0, 2);
    const [currentHours, currentMinutes] = manualTime.split(':');
    const nextHours = part === 'hours' ? digits : currentHours;
    const nextMinutes = part === 'minutes' ? digits : currentMinutes;
    const nextValue = `${nextHours}:${nextMinutes}`;
    setManualTime(nextValue);

    if (nextHours.length === 2 && nextMinutes.length === 2) {
      const hours = Number(nextHours);
      const minutes = Number(nextMinutes);
      if (hours < 24 && minutes < 60) {
        timeEditedRef.current = true;
        setTime(nextValue);
      }
    }
  };

  const updateDatePart = (part: 'day' | 'month' | 'year', value: string) => {
    const digits = value.replace(/\D/g, '');
    const nextYear = part === 'year' ? digits : dateYear;
    const nextMonth = part === 'month' ? digits : dateMonth;
    const nextDay = part === 'day' ? digits : dateDay;

    if (part === 'year' && digits.length > 4) return;
    if (part !== 'year' && digits.length > 2) return;

    setDate(`${nextYear}-${nextMonth}-${nextDay}`);
    dateEditedRef.current = true;
  };

  const updateTimePart = (part: 'hours' | 'minutes', value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length > 2) return;

    const nextHours = part === 'hours' ? digits : timeHours;
    const nextMinutes = part === 'minutes' ? digits : timeMinutes;
    setTime(`${nextHours}:${nextMinutes}`);
    timeEditedRef.current = true;
  };

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
        {showTopbar && (
          <header className="topbar">
            <div className="topbar-identity">
              <a
                href="#/workspace"
                className="settings-action"
                aria-label="Studio"
                title="Studio"
              >
                <span className="action-label">Studio</span>
              </a>
              <div className="brand">AWAITMSG</div>
            </div>

            <div className="topbar-actions">
              <div className="logout-action-group">
                <button
                  className="account-action"
                  onClick={() => {
                    setIsConfirmingLogout((current) => !current);
                  }}
                  disabled={authBusy}
                  title="Log out"
                  aria-label="Log out"
                  aria-expanded={isConfirmingLogout}
                >
                  <span className="action-label">Log out</span>
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

              <button
                type="button"
                className="settings-action"
                onClick={() => {
                  setShowAuthForm(false);
                  setIsConfirmingLogout(false);
                  onOpenSettings();
                }}
                title="Settings"
                aria-label="Settings"
              >
                <span className="action-label">Settings</span>
              </button>
            </div>
          </header>
        )}

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
                    <button type="button" onClick={handleForgetAccount} disabled={authBusy}>
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
                      <button type="submit" aria-label="Send to AI Assistant" title="Send request to AI Assistant" disabled={isThinking || !assistantPrompt.trim()}>
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
                          <span>
                            {assistantIntent.date} · {assistantIntent.time}
                          </span>
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
              <div className="field chat-field">
                <label className="composer-field-label">Chat</label>

                <ChatPicker
                  chats={chats}
                  selectedChat={selectedChat}
                  onSelect={setSelectedChat}
                  onAddChat={handleAddChat}
                  onRemoveChat={handleRemoveChat}
                  onError={(msg, title) => showNotification(msg, 'error', title)}
                />
              </div>

              <div className="field message-field">
                <label className="composer-field-label">Your message</label>

                <div className="message-input-wrap">
                  {!message && <span className="message-placeholder" aria-hidden="true">Leave something for later...</span>}
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    aria-label="Your message"
                    maxLength={4096}
                    lang="ru"
                    spellCheck={false}
                  />

                <div className="message-field-meta" aria-live="polite">
                  <div className="message-action-icons">
                    <button
                      type="button"
                      className="message-attachment-button"
                      aria-label="Add attachment"
                      title="Add attachment"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip size={17} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                  </div>

                  <div className={`message-attachments ${attachments.length ? 'has-attachments' : ''}`}>
                    {attachments.map((attachment, index) => {
                      const isImage = /\.(?:avif|gif|jpe?g|png|webp)$/i.test(attachment.name);
                      const isAudio = /\.(?:aac|aiff|flac|m4a|mp3|ogg|wav|wma)$/i.test(attachment.name);
                      const nameWithoutExtension = attachment.name.includes('.')
                        ? attachment.name.slice(0, attachment.name.lastIndexOf('.'))
                        : attachment.name;
                      const fileExtension = attachment.name.includes('.')
                        ? attachment.name.slice(attachment.name.lastIndexOf('.'))
                        : '';
                      const baseLength = Math.max(0, 12 - (fileExtension.length || 0));
                      const compactBaseName = nameWithoutExtension.length > baseLength
                        ? `${nameWithoutExtension.slice(0, baseLength)}…`
                        : nameWithoutExtension;
                      const shortName = attachment.name.length > 18
                        ? `${compactBaseName}${fileExtension}`
                        : attachment.name;

                      return (
                        <span
                          className="message-attachment-chip"
                          key={`${attachment.path}-${index}`}
                          onMouseEnter={(event) => {
                            if (!isImage) return;
                            clearPreviewTimer();
                            const rect = event.currentTarget.getBoundingClientRect();
                            setPreviewPosition({
                              left: rect.left + rect.width / 2,
                              top: rect.top - 12,
                            });
                            previewTimerRef.current = window.setTimeout(() => {
                              setPreviewAttachmentIndex(index);
                            }, 850);
                          }}
                          onMouseMove={(event) => {
                            if (!isImage || previewAttachmentIndex !== index) return;
                            const rect = event.currentTarget.getBoundingClientRect();
                            setPreviewPosition({
                              left: rect.left + rect.width / 2,
                              top: rect.top - 12,
                            });
                          }}
                          onMouseLeave={() => {
                            clearPreviewTimer();
                            setPreviewAttachmentIndex(null);
                            setPreviewPosition(null);
                          }}
                        >
                          {isImage ? (
                            <img className="message-attachment-thumb" src={attachment.path} alt={attachment.name} />
                          ) : (
                            <span className={`message-attachment-filemark ${isAudio ? 'is-audio' : ''}`} aria-hidden="true">
                              {isAudio ? (
                                <svg className="message-attachment-music-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                  <path d="M9 18V7.7l9-2.1v9.1a2.7 2.7 0 1 1-2.7-2.7 3.4 3.4 0 0 1 .9.1V7.8l-6.2 1.5V18a2.7 2.7 0 1 1-2.7-2.7A3.5 3.5 0 0 1 9 18Z" fill="currentColor"/>
                                </svg>
                              ) : (
                                <svg className="message-attachment-document-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                  <path d="M7 3.5A2.5 2.5 0 0 1 9.5 1h6.2c.4 0 .8.1 1.1.4l2.8 2.8c.3.3.4.7.4 1.1v13.2A2.5 2.5 0 0 1 17.5 21h-8A2.5 2.5 0 0 1 7 18.5v-15Zm3 2.5h5v2h-5V6Zm0 4h7v2h-7v-2Zm0 4h7v2h-7v-2Zm-1-8h.01v2H9V6Z" fill="currentColor"/>
                                </svg>
                              )}
                            </span>
                          )}
                          <span className="message-attachment-name" title={attachment.name}>{shortName}</span>
                          <button
                            type="button"
                            aria-label={`Remove ${attachment.name}`}
                            onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                          >
                            <X size={12} aria-hidden="true" />
                          </button>
                        </span>
                      );
                    })}

                    {previewAttachmentIndex !== null && attachments[previewAttachmentIndex] && /\.(?:avif|gif|jpe?g|png|webp)$/i.test(attachments[previewAttachmentIndex].name) && previewPosition ? (
                      <div
                        className="message-attachment-preview"
                        style={{ left: `${previewPosition.left}px`, top: `${previewPosition.top}px` }}
                        aria-label={`Preview of ${attachments[previewAttachmentIndex].name}`}
                      >
                        <img src={attachments[previewAttachmentIndex].path} alt={attachments[previewAttachmentIndex].name} />
                      </div>
                    ) : null}
                  </div>

                  <span className="message-counter">{message.length} / 4096</span>
                  <div className="message-send-control">
                    <span
                      className={`message-selected-option-icon ${selectedMessageOption ? '' : 'is-empty'}`}
                      aria-hidden={!selectedMessageOption}
                        aria-label={selectedMessageOption === 'silent' ? 'Silent send selected' : selectedMessageOption === 'effect' ? 'Effect selected' : undefined}
                        title={selectedMessageOption === 'silent' ? 'Silent send' : selectedMessageOption === 'effect' ? 'Effect' : undefined}
                    >
                        {selectedMessageOption === 'silent'
                          ? '🔕'
                          : selectedEffect?.emoticon || '✨'}
                    </span>
                    <button
                      type="button"
                      className="message-send-button"
                      ref={messageOptionsButtonRef}
                      aria-label="Send now"
                      aria-expanded={messageOptionsOpen}
                      aria-haspopup="menu"
                      title="Message options"
                      onClick={() => setMessageOptionsOpen((current) => !current)}
                    >
                      <Menu size={17} strokeWidth={1.8} aria-hidden="true" />
                    </button>

                    {messageOptionsOpen && (
                      <div className="message-options-menu" ref={messageOptionsRef} role="menu" aria-label="Message options">
                        <button
                          type="button"
                          className={selectedMessageOption === 'silent' ? 'is-selected' : ''}
                          role="menuitemradio"
                          aria-checked={selectedMessageOption === 'silent'}
                          onClick={() => {
                            setSelectedMessageOption((current) => current === 'silent' ? null : 'silent');
                            setMessageOptionsOpen(false);
                          }}
                        >
                          <span className="message-option-icon" aria-hidden="true">🔕</span>
                          <span className="message-option-label">Silent sending</span>
                        </button>
                        <button
                          type="button"
                          className={selectedMessageOption === 'effect' ? 'is-selected' : ''}
                          role="menuitemradio"
                          aria-checked={selectedMessageOption === 'effect'}
                          onClick={() => {
                            if (selectedMessageOption === 'effect') {
                              setSelectedMessageOption(null);
                              setEffectMenuOpen(false);
                              setMessageOptionsOpen(false);
                              return;
                            }
                            setSelectedMessageOption('effect');
                            setEffectMenuOpen(true);
                          }}
                        >
                          <span className="message-option-icon" aria-hidden="true">✨</span>
                          <span className="message-option-label">Effect</span>
                        </button>
                      </div>
                    )}
                    {messageOptionsOpen && selectedMessageOption === 'effect' && effectMenuOpen && (
                      <div ref={effectMenuRef} className="message-effect-menu" role="menu" aria-label="Available Telegram effects">
                        <div className="message-effect-menu-header">
                          <span>Effect</span>
                          <span>{availableEffects.length}</span>
                        </div>
                        <button
                          type="button"
                          className={!selectedEffectId ? 'is-selected' : ''}
                          role="menuitemradio"
                          aria-checked={!selectedEffectId}
                          onClick={() => {
                            const isAlreadySelected = selectedEffectId === null;
                            setSelectedEffectId(null);
                            setSelectedMessageOption(isAlreadySelected ? null : 'effect');
                            setEffectMenuOpen(false);
                            setMessageOptionsOpen(false);
                          }}
                        >
                          <span className="message-option-icon" aria-hidden="true">✦</span>
                          <span className="message-option-label">Without effect</span>
                        </button>

                        {effectsLoading ? (
                          <div className="message-effect-status" role="status">Loading effects…</div>
                        ) : (
                          <>
                            {freeEffects.length > 0 && (
                              <div className="message-effect-section-label">Free</div>
                            )}
                            {freeEffects.slice(0, 6).map((effect) => (
                              <button
                                key={effect.id}
                                type="button"
                                className={selectedEffectId === effect.id ? 'is-selected' : ''}
                                role="menuitemradio"
                                aria-checked={selectedEffectId === effect.id}
                                onClick={() => {
                                  const isAlreadySelected = selectedEffectId === effect.id;
                                  setSelectedEffectId(isAlreadySelected ? null : effect.id);
                                  setSelectedMessageOption(isAlreadySelected ? null : 'effect');
                                  setEffectMenuOpen(false);
                                  setMessageOptionsOpen(false);
                                }}
                              >
                                <span className="message-option-icon" aria-hidden="true">{effect.emoticon}</span>
                                <span className="message-option-label">Effect</span>
                              </button>
                            ))}
                            {premiumEffects.length > 0 && (
                              <>
                                <button
                                  type="button"
                                  className="message-effect-section-toggle"
                                  aria-expanded={premiumEffectsOpen}
                                  onClick={() => setPremiumEffectsOpen((current) => !current)}
                                >
                                  <span className="message-effect-section-label">Premium</span>
                                  <span aria-hidden="true">{premiumEffectsOpen ? '⌃' : '⌄'}</span>
                                </button>
                                {premiumEffectsOpen && premiumEffects.map((effect) => (
                                  <button
                                    key={effect.id}
                                    type="button"
                                    className={selectedEffectId === effect.id ? 'is-selected' : ''}
                                    role="menuitemradio"
                                    aria-checked={selectedEffectId === effect.id}
                                    onClick={() => {
                                      const isAlreadySelected = selectedEffectId === effect.id;
                                      setSelectedEffectId(isAlreadySelected ? null : effect.id);
                                      setSelectedMessageOption(isAlreadySelected ? null : 'effect');
                                      setEffectMenuOpen(false);
                                      setMessageOptionsOpen(false);
                                    }}
                                  >
                                    <span className="message-option-icon" aria-hidden="true">{effect.emoticon}</span>
                                    <span className="message-option-label">Premium</span>
                                  </button>
                                ))}
                              </>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                </div>
                <input
                  ref={fileInputRef}
                  className="message-attachment-input"
                  type="file"
                  multiple
                  onChange={handleFileSelection}
                />
              </div>

              <div className="field moment-field">
                <div className="schedule-row">
                  <div className="moment-controls">
                    <div className="moment-date-display">
                      <CalendarDays className="moment-date-icon" aria-hidden="true" size={18} strokeWidth={1.8} onClick={() => togglePicker('date', datePickerRef)} />
                      <input className="moment-segment moment-day" value={dateDay} inputMode="numeric" maxLength={2} aria-label="Day" onChange={(event) => updateDatePart('day', event.target.value)} />
                      <span className="moment-date-separator">/</span>
                      <input className="moment-segment moment-month" value={dateMonth} inputMode="numeric" maxLength={2} aria-label="Month" onChange={(event) => updateDatePart('month', event.target.value)} />
                      <span className="moment-date-separator">/</span>
                      <input className="moment-segment moment-year" value={dateYear} inputMode="numeric" maxLength={4} aria-label="Year" onChange={(event) => updateDatePart('year', event.target.value)} />
                    </div>

                    <div ref={timeDisplayRef} className="moment-time-display">
                      <Clock ref={timePickerRef} className="moment-time-icon" aria-hidden="true" size={18} strokeWidth={1.8} onClick={openTimePicker} />
                      <input className="moment-segment moment-time-hours" value={timeHours} inputMode="numeric" maxLength={2} aria-label="Hours" onChange={(event) => updateTimePart('hours', event.target.value)} />
                      <span className="moment-time-separator" aria-hidden="true">:</span>
                      <input className="moment-segment moment-time-minutes" value={timeMinutes} inputMode="numeric" maxLength={2} aria-label="Minutes" onChange={(event) => updateTimePart('minutes', event.target.value)} />
                    </div>

                    {timePickerOpen && createPortal(
                      <div
                        ref={timeMenuRef}
                        className="start-screen-time-menu"
                        style={timeMenuPosition}
                        role="listbox"
                        aria-label="Choose time"
                      >
                        <label className="start-screen-time-manual">
                          <span>Manual time</span>
                          <span className="start-screen-time-manual-fields">
                            <input
                              type="text"
                              value={manualTime.split(':')[0]}
                              inputMode="numeric"
                              maxLength={2}
                              aria-label="Hours"
                              onChange={(event) => updateManualTimePart('hours', event.target.value)}
                            />
                            <b aria-hidden="true">:</b>
                            <input
                              type="text"
                              value={manualTime.split(':')[1]}
                              inputMode="numeric"
                              maxLength={2}
                              aria-label="Minutes"
                              onChange={(event) => updateManualTimePart('minutes', event.target.value)}
                            />
                          </span>
                        </label>
                        <select
                          className="start-screen-time-list"
                          aria-label="Choose time"
                          size={6}
                          value={`${time.slice(0, 2)}:00`}
                          onChange={(event) => {
                            timeEditedRef.current = true;
                            manualTimeEditedRef.current = false;
                            setTime(event.target.value);
                            setManualTime(event.target.value);
                            setTimePickerOpen(false);
                          }}
                        >
                          {Array.from({ length: 24 }, (_, hour) => {
                            const option = `${String(hour).padStart(2, '0')}:00`;
                            return <option key={option} value={option}>{option}</option>;
                          })}
                        </select>
                      </div>,
                      document.body,
                    )}

                    <input
                      ref={datePickerRef}
                      className="moment-native-picker moment-native-date-picker"
                      type="date"
                      value={date}
                      aria-label="Choose date"
                      onChange={(event) => {
                        dateEditedRef.current = true;
                        openPickerRef.current = null;
                        setDate(event.target.value);
                      }}
                    />
                    <input
                      className="moment-native-picker moment-native-time-picker"
                      type="time"
                      value={time}
                      aria-label="Choose time"
                      onChange={(event) => {
                        timeEditedRef.current = true;
                        openPickerRef.current = null;
                        setTime(event.target.value);
                      }}
                    />
                  </div>
                </div>
              </div>

              <button
                className={`action-button ${successPulse ? 'schedule-success' : ''}`}
                onClick={() => {
                  if (!selectedChat) {
                    handleSchedule();
                    return;
                  }
                  handleSchedule({
                    chatId: selectedChat.id,
                    message,
                    date,
                    time,
                    attachments: attachments.map((attachment) => attachment.path),
                    silent: selectedMessageOption === 'silent',
                    effect: selectedEffectId ?? undefined,
                  });
                }}
                disabled={scheduling}
              >
                {scheduling ? 'Scheduling…' : successPulse ? 'SEALED' : 'Seal it'}
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
                selectedMessageOption={selectedMessageOption}
              />
            </section>

            <footer>
              <span>{getTimezoneLabel()}</span>
            </footer>
          </>
        )}
      </div>
    </>
  );
}
