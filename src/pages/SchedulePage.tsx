import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { Pencil, Settings } from 'lucide-react';
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
  handleSchedule: (payload?: { chatId: string; message: string; date: string; time: string }) => void;
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
                <span className="action-icon" aria-hidden="true">
                  <Pencil size={15} strokeWidth={1.8} />
                </span>
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
                <span className="action-icon" aria-hidden="true">
                  <Settings size={16} strokeWidth={1.8} />
                </span>
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
              <div className="field">
                <label>Chat</label>

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
                className={`action-button ${successPulse ? 'schedule-success' : ''}`}
                onClick={() => handleSchedule()}
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
