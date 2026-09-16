import { useEffect, useState } from 'react';
import type { Chat } from '@/types';
import {
  loadChats,
  loadHiddenChats,
  saveChats,
  saveHiddenChats,
} from '@/lib/storage';

export function useChats({ connected }: { connected: boolean }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [removeModal, setRemoveModal] = useState<{
    show: boolean;
    chat: Chat | null;
  }>({
    show: false,
    chat: null,
  });

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
          username: chat.username || '',
          type: chat.type || 'unknown',
          avatarDataUrl: chat.avatarDataUrl || '',
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

        void Promise.all(visibleChats.map(async (chat) => {
          try {
            const avatarResult = await window.telegram.getChatAvatar(chat.id);
            const avatarDataUrl = avatarResult.success ? avatarResult.avatarDataUrl || '' : '';
            if (!avatarDataUrl) return;

            setChats((current) => {
              const updated = current.map((item) => item.id === chat.id ? { ...item, avatarDataUrl } : item);
              saveChats(updated);
              return updated;
            });
            setSelectedChat((current) => current?.id === chat.id ? { ...current, avatarDataUrl } : current);
          } catch {
            // Keep the chat visible when its avatar is unavailable.
          }
        }));

      })
      .catch(() => {
        // Keep locally saved chats if Telegram chat loading fails.
      });
  }, [connected]);

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

  return {
    chats,
    setChats,
    selectedChat,
    setSelectedChat,
    removeModal,
    setRemoveModal,
    handleAddChat,
    handleRemoveChat,
    confirmRemoveChat,
  };
}
