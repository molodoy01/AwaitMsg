import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatPicker } from './ChatPicker';
import { LocaleProvider } from '@/lib/i18n';
import type { Chat } from '@/types';

function renderPicker(findChat: (query: string) => Promise<unknown>) {
  vi.stubGlobal('telegram', { findChat });

  const onSelect = vi.fn();
  const onAddChat = vi.fn();
  const onRemoveChat = vi.fn();

  render(
    <LocaleProvider>
      <ChatPicker
        chats={[]}
        selectedChat={null}
        onSelect={onSelect}
        onAddChat={onAddChat}
        onRemoveChat={onRemoveChat}
      />
    </LocaleProvider>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Choose a chat…' }));

  return { onSelect, onAddChat };
}

describe('ChatPicker global username result flow', () => {
  it('adds and selects a private user returned from a global username lookup', async () => {
    const privateUser: Chat = {
      id: '9001',
      name: 'Alice Example',
      username: 'alice_12345',
      type: 'private',
      avatarDataUrl: '',
    };
    const findChat = vi.fn().mockResolvedValue({ success: true, chat: privateUser });
    const { onSelect, onAddChat } = renderPicker(findChat);
    const input = screen.getByPlaceholderText('Add chat, @name or phone');

    fireEvent.change(input, { target: { value: '@alice_12345' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(findChat).toHaveBeenCalledWith('@alice_12345');
      expect(onAddChat).toHaveBeenCalledWith(privateUser);
      expect(onSelect).toHaveBeenCalledWith(privateUser);
    });
  });
});
