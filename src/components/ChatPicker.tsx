import { useEffect, useRef, useState } from 'react';
import type { Chat } from '@/types';
import './ChatPicker.css';

const chatTypeLabels: Record<NonNullable<Chat['type']>, string> = {
  private: 'People',
  group: 'Group',
  supergroup: 'Group',
  channel: 'Channel',
  unknown: 'Chat',
};

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
  const [searchQuery, setSearchQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredChats = chats.filter((chat) => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) return true;

    const name = (chat.name || '').toLowerCase();
    const username = (chat.username || '').toLowerCase();

    return name.includes(query) || username.includes(query);
  });

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

  useEffect(() => {
    if (!open) return;

    searchInputRef.current?.focus();

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        setShowAddForm(false);
      }
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open]);

  function handleAddChat() {
    if (!addQuery.trim() || adding) return;

    setAdding(true);
    setAddError('');

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
          setAddError(result.error || 'That chat could not be found.');
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
        setAddError('Telegram could not be reached. Try again.');

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

  function selectChat(chat: Chat) {
    onSelect(chat);
    setSearchQuery('');
    setOpen(false);
  }

  function togglePicker() {
    setOpen((current) => !current);
    if (!open) {
      setSearchQuery('');
      setAddError('');
    }
  }

  return (
    <div className={`chat-picker chat-picker-compact ${open ? 'is-open' : ''}`} ref={containerRef}>
      <div
        className={`chat-picker-current ${open ? 'is-open' : ''}`}
        onClick={togglePicker}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            togglePicker();
          }
        }}
        tabIndex={0}
        role="button"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {selectedChat ? (
          <>
            <span className="chat-picker-current-avatar" aria-hidden="true">
              {selectedChat.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="chat-picker-current-copy">
            <span className="chat-picker-current-name">{selectedChat.name}</span>
            <span className="chat-picker-current-type">
              {selectedChat.name === 'Saved Messages'
                ? 'Saved Messages'
                : chatTypeLabels[selectedChat.type || 'unknown']}
            </span>
            </span>
          </>
        ) : (
          'Choose chat'
        )}
      </div>

      <div
        className={`chat-picker-menu ${open ? 'open' : ''}`}
        role="dialog"
        aria-label="Send to"
        aria-hidden={!open}
      >
        <div className="chat-picker-menu-header">
          <span className="chat-picker-menu-eyebrow">Send to</span>
          <strong>{selectedChat?.name || 'Choose a chat'}</strong>
        </div>

        <div className="chat-picker-search-wrap">
          <input
            type="search"
            ref={searchInputRef}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Find a chat"
            className="chat-picker-search"
            aria-label="Find a chat"
            tabIndex={open ? 0 : -1}
          />
        </div>

        <div className="chat-picker-list" role="listbox" aria-label="Telegram chats">
          {filteredChats.length > 0 ? filteredChats.map((chat) => (
            <div
              key={chat.id}
              className={`chat-option ${selectedChat?.id === chat.id ? 'selected' : ''}`}
              onClick={() => selectChat(chat)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  selectChat(chat);
                }
              }}
              role="option"
              aria-selected={selectedChat?.id === chat.id}
              tabIndex={open ? 0 : -1}
            >
              <span className="chat-option-avatar" aria-hidden="true">
                {chat.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="chat-option-copy">
                <span className="chat-option-name">{chat.name}</span>
                <span className="chat-option-type">
                  {chat.name === 'Saved Messages'
                    ? 'Saved Messages'
                    : chatTypeLabels[chat.type || 'unknown']}
                </span>
              </span>
              {selectedChat?.id === chat.id && (
                <span className="chat-option-selected" aria-label="Selected">✓</span>
              )}
              {selectedChat?.id === chat.id && (
                <button
                  type="button"
                  className="chat-option-remove"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveChat(chat);
                  }}
                  aria-label={`Remove ${chat.name} from saved chats`}
                  title="Remove from saved chats"
                >
                  ×
                </button>
              )}
            </div>
          )) : (
            <div className="chat-picker-empty" role="status">
              <strong>{chats.length === 0 ? 'No chats saved yet' : 'No chats found'}</strong>
              <span>{chats.length === 0 ? 'Add a Telegram chat to continue.' : 'Try another name or username.'}</span>
            </div>
          )}
        </div>

        <button
          type="button"
          className="chat-add"
          onClick={() => {
            setShowAddForm((current) => !current);
            setAddError('');
          }}
          aria-expanded={showAddForm}
          tabIndex={open ? 0 : -1}
        >
          <span className="chat-add-mark" aria-hidden="true">+</span>
          <span>Add another chat</span>
        </button>

        <div className={`chat-add-form ${showAddForm ? 'open' : ''}`} aria-hidden={!showAddForm}>
          <input
            type="text"
            value={addQuery}
            onChange={(event) => setAddQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="@username or chat name"
            autoFocus={showAddForm}
            tabIndex={showAddForm ? 0 : -1}
          />
          <button
            type="button"
            className="chat-add-button"
            onClick={handleAddChat}
            disabled={adding}
            tabIndex={showAddForm && open ? 0 : -1}
          >
            {adding ? 'Adding…' : 'Add'}
          </button>
          {addError && <div className="chat-picker-inline-error" role="alert">{addError}</div>}
        </div>
      </div>
    </div>
  );
}

