import type { ScheduledMessage, Template } from '@/types';

const UPCOMING_KEY = 'awaitmsg_upcoming';
const SENT_KEY = 'awaitmsg_sent';
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

export function loadUpcoming(): ScheduledMessage[] {
  return load<ScheduledMessage[]>(UPCOMING_KEY, []);
}

export function loadSent(): ScheduledMessage[] {
  return load<ScheduledMessage[]>(SENT_KEY, []);
}

export function saveUpcoming(messages: ScheduledMessage[]): void {
  save(UPCOMING_KEY, messages);
}

export function saveSent(messages: ScheduledMessage[]): void {
  save(SENT_KEY, messages);
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
