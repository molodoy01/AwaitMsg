export {};

declare global {
  interface Window {
    gemini: {
      generate: (prompt: string, context: {
        currentDate: string;
        currentTime: string;
        chats: { id: string; name: string }[];
      }) => Promise<{
        success: boolean;
        intent?: {
          action: 'schedule' | 'clarify';
          chat: string;
          message: string;
          date: string;
          time: string;
          clarification: string;
        };
        errorCode?: 'quota' | 'generic' | 'setup_required';
        error?: string;
      }>;
      getSettings: () => Promise<{
        hasKey: boolean;
        maskedKey: string;
        enabled: boolean;
        encryptionAvailable: boolean;
      }>;
      saveKey: (key: string) => Promise<{
        success: boolean;
        settings?: {
          hasKey: boolean;
          maskedKey: string;
          enabled: boolean;
          encryptionAvailable: boolean;
        };
        error?: string;
      }>;
      removeKey: () => Promise<{
        success: boolean;
        settings?: {
          hasKey: boolean;
          maskedKey: string;
          enabled: boolean;
          encryptionAvailable: boolean;
        };
        error?: string;
      }>;
      setEnabled: (enabled: boolean) => Promise<{
        success: boolean;
        settings?: {
          hasKey: boolean;
          maskedKey: string;
          enabled: boolean;
          encryptionAvailable: boolean;
        };
        error?: string;
      }>;
    };
    telegram: {
      getConfig: () => Promise<{ success: boolean; config?: { hasCredentials?: boolean; hasSession?: boolean; connected?: boolean }; error?: string }>;
      saveCredentials: (data: { API_ID?: string | number; API_HASH?: string; SESSION_STRING?: string; apiId?: string | number; apiHash?: string; sessionString?: string }) => Promise<{ success: boolean; config?: { hasCredentials?: boolean; hasSession?: boolean; connected?: boolean }; saved?: boolean; error?: string }>;
      clearSession: () => Promise<{ success: boolean; cleared?: boolean; config?: { hasCredentials?: boolean; hasSession?: boolean; connected?: boolean }; error?: string }>;
      login: (data: { API_ID?: string | number; API_HASH?: string; phoneNumber?: string; phone?: string; password?: string; phoneCode?: string; apiId?: string | number; apiHash?: string }) => Promise<{ success: boolean; requiresCode?: boolean; requiresPassword?: boolean; nextStep?: string; error?: string; session?: string; user?: unknown; phoneCodeHash?: string; isCodeViaApp?: boolean }>;
      connect: () => Promise<{ success: boolean; error?: string }>;
      getChats: () => Promise<{ success: boolean; chats?: { id: string; name: string }[]; error?: string }>;
      findChat: (query: string) => Promise<{
        success: boolean;
        chat?: { id: string; name: string };
        error?: string;
      }>;
      getContacts: () => Promise<{
        success: boolean;
        contacts?: { id: string; name: string; username?: string; phone?: string }[];
        error?: string;
      }>;
      send: (chatId: string, message: string) => Promise<{
        success: boolean;
        error?: string;
      }>;
      schedule: (data: {
        chatId: string;
        message: string;
        targetTimestamp: number;
      }) => Promise<{
        success: boolean;
        id?: string | number;
        telegramMessageId?: string | number;
        confirmed?: boolean;
        error?: string;
      }>;
      cancel: (data: {
        chatId: string;
        telegramMessageId: string | number;
      }) => Promise<{
        success: boolean;
        error?: string;
      }>;
      testSend: (chatId: string, message: string) => Promise<{
        success: boolean;
        error?: string;
      }>;
      onStatus: (callback: (status: unknown) => void) => void;
    };
  }
}