import { useEffect, useRef, useState } from 'react';
import { useAssistant } from '@/hooks/useAssistant';
import { useChats } from '@/hooks/useChats';
import { useNotifications } from '@/hooks/useNotifications';
import { useScheduler } from '@/hooks/useScheduler';
import { useTelegramAuth } from '@/hooks/useTelegramAuth';
import type { Chat } from '@/types';
import { AppShell } from './AppShell';
import { SchedulePage } from './pages/SchedulePage';
import { SettingsPage } from './pages/SettingsPage';
import { WorkspacePage } from './pages/WorkspacePage';

type AppRoute = '/' | '/workspace' | '/settings';

function getCurrentHashPath(): AppRoute {
  const hash = window.location.hash.replace(/^#/, '').trim();
  const path = hash ? (hash.startsWith('/') ? hash : `/${hash}`) : '/';

  if (path === '/workspace' || path === '/settings') {
    return path;
  }

  return '/';
}

function App() {
  const [message, setMessage] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [route, setRoute] = useState<AppRoute>(getCurrentHashPath());
  const [scheduleActiveTab, setScheduleActiveTab] = useState<'upcoming' | 'sent'>('upcoming');
  const [workspaceActiveTab, setWorkspaceActiveTab] = useState<'upcoming' | 'sent'>('upcoming');

  const {
    notification,
    showNotification,
    closeNotification,
  } = useNotifications();

  const chatsApiRef = useRef<{
    setChats: React.Dispatch<React.SetStateAction<Chat[]>>;
    setSelectedChat: React.Dispatch<React.SetStateAction<Chat | null>>;
  } | null>(null);

  const {
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
  } = useTelegramAuth({
    showNotification,
    setIsSettingsOpen,
    setChats: (value) => {
      chatsApiRef.current?.setChats(value);
    },
    setSelectedChat: (value) => {
      chatsApiRef.current?.setSelectedChat(value);
    },
  });

  const {
    chats,
    setChats,
    selectedChat,
    setSelectedChat,
    removeModal,
    setRemoveModal,
    handleAddChat,
    handleRemoveChat,
    confirmRemoveChat,
  } = useChats({ connected });

  useEffect(() => {
    chatsApiRef.current = {
      setChats,
      setSelectedChat,
    };
  }, [setChats, setSelectedChat]);

  const {
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
    settingsKey,
    setSettingsKey,
    settingsBusy,
    settingsError,
    assistantExamples,
    handleSaveGeminiKey,
    handleRemoveGeminiKey,
    handleToggleAssistant,
    handleAssistantSubmit,
  } = useAssistant({ chats });

  const {
    date,
    time,
    upcoming,
    sent,
    scheduling,
    successPulse,
    lastAction,
    revealingId,
    cancelingIds,
    sendingIds,
    publishingDraft,
    dateEditedRef,
    timeEditedRef,
    openPickerRef,
    handleSchedule,
    handleCancelMessage,
    handleSendNow,
    handleSendDraftNow,
    handleDeleteMessage,
    handleClearSent,
    handleClearAll,
    setDate,
    setTime,
  } = useScheduler({
    connected,
    selectedChat,
    chats,
    message,
    showNotification,
    setMessage,
    setAssistantPrompt,
    setAssistantResponse,
    setAssistantIntent,
  });

  useEffect(() => {
    if (isSettingsOpen) {
      setIsConfirmingLogout(false);
    }
  }, [isSettingsOpen, setIsConfirmingLogout]);

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(getCurrentHashPath());
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  useEffect(() => {
    if (route === '/settings') {
      setIsSettingsOpen(true);
    } else {
      setIsSettingsOpen(false);
    }
  }, [route]);

  const navigate = (nextRoute: AppRoute) => {
    const target = nextRoute === '/' ? '#/' : `#${nextRoute}`;
    if (window.location.hash !== target) {
      window.location.hash = target;
    }
    setRoute(nextRoute);
  };

  const renderSettingsPage = () => (
    <SettingsPage
      onClose={() => {
        setShowAuthForm(false);
        setIsSettingsOpen(false);
        navigate('/');
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

  return (
    <AppShell>
      {route === '/workspace' ? (
        <WorkspacePage
          connected={connected}
          chats={chats}
          selectedChat={selectedChat}
          setSelectedChat={setSelectedChat}
          onAddChat={(chat) => handleAddChat(chat)}
          onRemoveChat={handleRemoveChat}
          removeModal={removeModal}
          setRemoveModal={setRemoveModal}
          confirmRemoveChat={confirmRemoveChat}
          date={date}
          time={time}
          scheduling={scheduling}
          successPulse={successPulse}
          upcoming={upcoming}
          sent={sent}
          activeTab={workspaceActiveTab}
          revealingId={revealingId}
          cancelingIds={cancelingIds}
          sendingIds={sendingIds}
          setDate={setDate}
          setTime={setTime}
          handleSchedule={handleSchedule}
          handleSendDraftNow={handleSendDraftNow}
          handleSendNow={handleSendNow}
          handleDeleteMessage={handleDeleteMessage}
          handleClearSent={handleClearSent}
          handleClearAll={handleClearAll}
          setActiveTab={setWorkspaceActiveTab}
          publishingDraft={publishingDraft}
          lastAction={lastAction}
          notification={notification}
          closeNotification={closeNotification}
          handleCancelMessage={handleCancelMessage}
        />
      ) : route === '/settings' ? (
        renderSettingsPage()
      ) : (
        <SchedulePage
          message={message}
          setMessage={setMessage}
          isSettingsOpen={isSettingsOpen}
          setIsSettingsOpen={setIsSettingsOpen}
          notification={notification}
          closeNotification={closeNotification}
          connected={connected}
          signedOut={signedOut}
          returningUserName={returningUserName}
          connecting={connecting}
          connectionResolved={connectionResolved}
          authStep={authStep}
          showAuthForm={showAuthForm}
          phoneNumber={phoneNumber}
          phoneCode={phoneCode}
          twoFactorPassword={twoFactorPassword}
          authBusy={authBusy}
          authError={authError}
          isConfirmingLogout={isConfirmingLogout}
          setIsConfirmingLogout={setIsConfirmingLogout}
          setShowAuthForm={setShowAuthForm}
          setAuthStep={setAuthStep}
          setPhoneNumber={setPhoneNumber}
          setPhoneCode={setPhoneCode}
          setTwoFactorPassword={setTwoFactorPassword}
          setAuthError={setAuthError}
          handleTelegramAuth={handleTelegramAuth}
          handleDisconnect={handleDisconnect}
          handleWelcomeBack={handleWelcomeBack}
          handleForgetAccount={handleForgetAccount}
          chats={chats}
          selectedChat={selectedChat}
          setSelectedChat={setSelectedChat}
          removeModal={removeModal}
          setRemoveModal={setRemoveModal}
          handleAddChat={handleAddChat}
          handleRemoveChat={handleRemoveChat}
          confirmRemoveChat={confirmRemoveChat}
          assistantPrompt={assistantPrompt}
          setAssistantPrompt={setAssistantPrompt}
          assistantResponse={assistantResponse}
          setAssistantResponse={setAssistantResponse}
          displayedAssistantResponse={displayedAssistantResponse}
          assistantIntent={assistantIntent}
          setAssistantIntent={setAssistantIntent}
          assistantExampleIndex={assistantExampleIndex}
          isThinking={isThinking}
          geminiSettings={geminiSettings}
          settingsKey={settingsKey}
          setSettingsKey={setSettingsKey}
          settingsBusy={settingsBusy}
          settingsError={settingsError}
          assistantExamples={assistantExamples}
          handleSaveGeminiKey={handleSaveGeminiKey}
          handleRemoveGeminiKey={handleRemoveGeminiKey}
          handleToggleAssistant={handleToggleAssistant}
          handleAssistantSubmit={handleAssistantSubmit}
          date={date}
          time={time}
          upcoming={upcoming}
          sent={sent}
          activeTab={scheduleActiveTab}
          scheduling={scheduling}
          successPulse={successPulse}
          revealingId={revealingId}
          cancelingIds={cancelingIds}
          sendingIds={sendingIds}
          dateEditedRef={dateEditedRef}
          timeEditedRef={timeEditedRef}
          openPickerRef={openPickerRef}
          handleSchedule={handleSchedule}
          handleCancelMessage={handleCancelMessage}
          handleSendNow={handleSendNow}
          handleDeleteMessage={handleDeleteMessage}
          handleClearSent={handleClearSent}
          handleClearAll={handleClearAll}
          setActiveTab={setScheduleActiveTab}
          setDate={setDate}
          setTime={setTime}
          onOpenSettings={() => {
            setShowAuthForm(false);
            setIsConfirmingLogout(false);
            setIsSettingsOpen(true);
            navigate('/settings');
          }}
          showNotification={showNotification}
        />
      )}
    </AppShell>
  );
}

export default App;