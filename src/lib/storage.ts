import type { ScheduledMessage, Template } from '@/types';

export type MessageHistoryScope = 'personal' | 'workspace';

const UPCOMING_KEYS: Record<MessageHistoryScope, string> = {
  personal: 'awaitmsg_upcoming',
  workspace: 'awaitmsg_workspace_upcoming',
};
const SENT_KEYS: Record<MessageHistoryScope, string> = {
  personal: 'awaitmsg_sent',
  workspace: 'awaitmsg_workspace_sent',
};
const HIDDEN_CHATS_KEY = 'awaitmsg_hidden_chats';
const CHATS_KEY = 'awaitmsg_chats';
const TEMPLATES_KEY = 'awaitmsg_templates';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export function loadUpcoming(scope: MessageHistoryScope = 'personal'): ScheduledMessage[] {
  return load<ScheduledMessage[]>(UPCOMING_KEYS[scope], []);
}

export function loadSent(scope: MessageHistoryScope = 'personal'): ScheduledMessage[] {
  return load<ScheduledMessage[]>(SENT_KEYS[scope], []);
}

export function saveUpcoming(messages: ScheduledMessage[], scope: MessageHistoryScope = 'personal'): void {
  save(UPCOMING_KEYS[scope], messages);
}

export function saveSent(messages: ScheduledMessage[], scope: MessageHistoryScope = 'personal'): void {
  save(SENT_KEYS[scope], messages);
}

export function loadHiddenChats(): string[] {
  return load<string[]>(HIDDEN_CHATS_KEY, []);
}

export function saveHiddenChats(chats: string[]): void {
  save(HIDDEN_CHATS_KEY, chats);
}

export function loadChats(): { id: string; name: string }[] {
  return load<{ id: string; name: string }[]>(CHATS_KEY, []);
}

export function saveChats(chats: { id: string; name: string }[]): void {
  save(CHATS_KEY, chats);
}

function isTemplate(value: unknown): value is Template {
  if (!value || typeof value !== 'object') return false;

  const template = value as Partial<Template>;

  return (
    typeof template.id === 'string' &&
    typeof template.name === 'string' &&
    typeof template.body === 'string' &&
    typeof template.createdAt === 'string' &&
    typeof template.updatedAt === 'string'
  );
}

export function loadTemplates(): Template[] {
  const stored = load<unknown>(TEMPLATES_KEY, []);

  if (!Array.isArray(stored)) return [];

  return stored.filter(isTemplate);
}

export function saveTemplates(templates: Template[]): void {
  save(TEMPLATES_KEY, templates);
}
