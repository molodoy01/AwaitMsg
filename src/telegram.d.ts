export {};

declare global {
  interface Window {
    telegram: {
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