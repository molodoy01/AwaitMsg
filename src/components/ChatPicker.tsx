import { useEffect, useRef, useState } from 'react';
import type { Chat } from '@/types';

interface Props {
  chats: Chat[];
  selectedChat: Chat | null;
  onSelect: (chat: Chat) => void;
  onAddChat: (chat: Chat) => void;
  onRemoveChat: (chat: Chat) => void;
  onError?: (message: string, title: string) => void;
}

export function ChatPicker({
  chats,
  selectedChat,
  onSelect,
  onAddChat,
  onRemoveChat,
  onError,
}: Props) {
  const [open, setOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setShowAddForm(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);

    return () =>
      document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleAddChat() {
    if (!addQuery.trim() || adding) return;

    setAdding(true);

    window.telegram
      .findChat(addQuery)
      .then((result) => {
        setAdding(false);

        if (result.success && result.chat) {
          onAddChat(result.chat);
          onSelect(result.chat);
          setAddQuery('');
          setShowAddForm(false);
          setOpen(false);
        } else {
          if (onError) {
            onError(
              result.error || 'That chat could not be found.',
              'Chat not found'
            );
          }
        }
      })
      .catch(() => {
        setAdding(false);

        if (onError) {
          onError(
            'We could not reach Telegram while looking for that chat.',
            'Connection problem'
          );
        }
      });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddChat();
    }
  }

  return (
    <div className="chat-picker" ref={containerRef}>
      <div
        className="chat-picker-current"
        onClick={() => setOpen(!open)}
        tabIndex={0}
        role="button"
      >
        {selectedChat ? selectedChat.name : 'Choose a chat…'}
      </div>

      <div className={`chat-picker-menu ${open ? 'open' : ''}`}>
        <div
          className="chat-add"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          Add a chat
        </div>

        <div
          className={`chat-add-form ${
            showAddForm ? 'open' : ''
          }`}
        >
          <input
            type="text"
            value={addQuery}
            onChange={(e) => setAddQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="@username or chat name"
            autoFocus={showAddForm}
          />

          <button
            className="chat-add-button"
            onClick={handleAddChat}
            disabled={adding}
          >
            {adding ? '...' : 'Add'}
          </button>
        </div>

        {chats.map((chat) => (
          <div
            key={chat.id}
            className={`chat-option ${
              selectedChat?.id === chat.id ? 'selected' : ''
            }`}
            onClick={() => {
              onSelect(chat);
              setOpen(false);
            }}
          >
            <span>{chat.name}</span>

            {selectedChat?.id === chat.id && (
              <button
                className="msg-btn delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveChat(chat);
                }}
                style={{ opacity: 1 }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

