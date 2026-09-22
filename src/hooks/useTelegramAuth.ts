import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Chat, NotificationType } from '@/types';
import { saveChats } from '@/lib/storage';
import { useLocale } from '@/lib/i18n';

export type TelegramAuthOptions = {
  showNotification: (message: string, type: NotificationType, title: string) => void;
  setIsSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setChats: Dispatch<SetStateAction<Chat[]>>;
  setSelectedChat: Dispatch<SetStateAction<Chat | null>>;
};

export function useTelegramAuth({
  showNotification,
  setIsSettingsOpen,
  setChats,
  setSelectedChat,
}: TelegramAuthOptions) {
  const { t } = useLocale();
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

  const handleTelegramAuth = useCallback(async () => {
    setAuthBusy(true);
    setAuthError('');

    try {
      const result = await window.telegram.login({
        phoneNumber,
        phoneCode: authStep === 'phone' ? undefined : phoneCode,
        password: authStep === 'password' ? twoFactorPassword : undefined,
      });

      if (!result.success) {
        const error = result.error || t('auth.authorizationFailed');

        if (
          authStep === 'code' &&
          /password|2fa|session_password_needed/i.test(error)
        ) {
          setAuthStep('password');
          setAuthError(t('auth.enterTwoFactor'));
        } else {
          setAuthError(error);
        }

        return;
      }

      if (result.requiresPassword || result.nextStep === 'password') {
        setAuthStep('password');
        setAuthError(t('auth.enterTwoFactor'));
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
          : t('auth.authorizationFailed')
      );
    } finally {
      setAuthBusy(false);
    }
  }, [authStep, phoneCode, phoneNumber, twoFactorPassword, t]);

  const handleDisconnect = useCallback(async () => {
    setAuthBusy(true);
    setAuthError('');

    try {
      const result = await window.telegram.signOutKeepSession();

      if (!result.success) {
        setAuthError(result.error || t('auth.disconnectFailed'));
        return;
      }

      setConnected(false);
      setSignedOut(true);
      setShowAuthForm(false);
      setReturningUserName(result.authState?.userName || returningUserName);
      setIsConfirmingLogout(false);
      setIsSettingsOpen(false);
      setChats([]);
      saveChats([]);
      setSelectedChat(null);
      setAuthStep('phone');
      setPhoneCode('');
      setTwoFactorPassword('');
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : t('auth.disconnectFailed')
      );
    } finally {
      setAuthBusy(false);
    }
  }, [returningUserName, setChats, setIsSettingsOpen, setSelectedChat, t]);

  const handleWelcomeBack = useCallback(async () => {
    if (authBusy) return;

    setAuthBusy(true);
    setConnecting(true);
    setAuthError('');

    try {
      const result = await window.telegram.welcomeBack();

      if (!result.success || !result.authState) {
        setAuthError(result.error || t('auth.restoreFailed'));
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
          : t('auth.restoreFailed')
      );
    } finally {
      setConnecting(false);
      setAuthBusy(false);
    }
  }, [authBusy, returningUserName, t]);

  const handleForgetAccount = useCallback(async () => {
    if (authBusy) return;

    setAuthBusy(true);
    setAuthError('');

    try {
      const result = await window.telegram.forgetAccount();

      if (!result.success || !result.authState) {
        setAuthError(result.error || t('auth.removeFailed'));
        return;
      }

      setConnected(false);
      setSignedOut(false);
      setReturningUserName('');
      setIsConfirmingLogout(false);
      setChats([]);
      saveChats([]);
      setSelectedChat(null);
      setShowAuthForm(false);
      setAuthStep('phone');
      setPhoneCode('');
      setTwoFactorPassword('');
      setConnectionResolved(true);
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : t('auth.removeFailed')
      );
    } finally {
      setAuthBusy(false);
    }
  }, [authBusy, setChats, setSelectedChat, t]);

  useEffect(() => {
    const loadAuth = async () => {
      window.telegram.getAuthState()
        .then((authResult) => {
          if (!authResult.success || !authResult.authState) {
            throw new Error(authResult.error || t('auth.readStateFailed'));
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
            setConnecting(false);
            setConnected(result.success);
            setConnectionResolved(true);

            if (!result.success) {
              setAuthError(result.error || t('auth.connectFailed'));
            }
          });
        })
        .catch((error) => {
          setConnecting(false);
          setConnected(false);
          setConnectionResolved(true);
          setAuthError(
            error instanceof Error
              ? error.message
              : t('auth.readConnectionFailed')
          );
        });
    };

    loadAuth();
  }, [showNotification, t]);

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
          setAuthError(value.error || t('auth.sessionExpired'));
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
  }, [t]);

  return {
    connected,
    setConnected,
    signedOut,
    setSignedOut,
    returningUserName,
    setReturningUserName,
    connecting,
    setConnecting,
    connectionResolved,
    setConnectionResolved,
    authStep,
    setAuthStep,
    showAuthForm,
    setShowAuthForm,
    phoneNumber,
    setPhoneNumber,
    phoneCode,
    setPhoneCode,
    twoFactorPassword,
    setTwoFactorPassword,
    authBusy,
    setAuthBusy,
    authError,
    setAuthError,
    isConfirmingLogout,
    setIsConfirmingLogout,
    handleTelegramAuth,
    handleDisconnect,
    handleWelcomeBack,
    handleForgetAccount,
  };
}
