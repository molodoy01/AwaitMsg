import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Chat, NotificationType } from '@/types';
import { saveChats } from '@/lib/storage';

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
  }, [authStep, phoneCode, phoneNumber, twoFactorPassword]);

  const handleDisconnect = useCallback(async () => {
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
      saveChats([]);
      setSelectedChat(null);
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
  }, [returningUserName, setChats, setIsSettingsOpen, setSelectedChat]);

  const handleWelcomeBack = useCallback(async () => {
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
  }, [authBusy, returningUserName]);

  const handleForgetAccount = useCallback(async () => {
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
          : 'Telegram account could not be removed.'
      );
    } finally {
      setAuthBusy(false);
    }
  }, [authBusy, setChats, setSelectedChat]);

  useEffect(() => {
    const loadAuth = async () => {
      window.telegram.getAuthState()
        .then((authResult) => {
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
            setConnecting(false);
            setConnected(result.success);
            setConnectionResolved(true);

            if (!result.success) {
              setAuthError(result.error || 'Saved session could not be connected.');
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
              : 'Unable to read connection settings.'
          );
        });
    };

    loadAuth();
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
