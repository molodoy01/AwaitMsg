import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScheduledMessage } from '@/types';
import { loadUpcoming, saveUpcoming } from './storage';
import {
  applyScheduleResult,
  createPendingSchedule,
  findMatchingScheduledMessage,
  getPendingSchedules,
} from './scheduling';

function createMemoryStorage() {
  const data = new Map<string, string>();

  return {
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
    removeItem(key: string) {
      data.delete(key);
    },
    clear() {
      data.clear();
    },
  };
}

function createPending(operationId: string): ScheduledMessage {
  return createPendingSchedule({
    operationId,
    chatId: 'chat-1',
    chatName: 'Test chat',
    text: 'Send the update',
    when: '2030-01-01T10:00:00.000Z',
    createdAt: '2029-12-31T10:00:00.000Z',
  });
}

describe('Pending scheduling recovery', () => {
  let storage: ReturnType<typeof createMemoryStorage>;

  beforeEach(() => {
    storage = createMemoryStorage();
    vi.stubGlobal('localStorage', storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates and persists a Pending record', () => {
    const pending = createPending('operation-1');

    saveUpcoming([pending]);

    expect(loadUpcoming()).toEqual([pending]);
    expect(loadUpcoming()[0].status).toBe('pending');
  });

  it('moves Pending to Scheduled after successful scheduling', () => {
    const pending = createPending('operation-1');
    const updated = applyScheduleResult(
      [pending],
      'operation-1',
      { success: true, telegramMessageId: 'telegram-1' }
    );

    expect(updated[0]).toMatchObject({
      operationId: 'operation-1',
      status: 'scheduled',
      telegramMessageId: 'telegram-1',
    });
  });

  it('persists telegramMessageId in the same local record', () => {
    const pending = createPending('operation-1');
    const scheduled = applyScheduleResult(
      [pending],
      'operation-1',
      { success: true, id: 42 }
    );

    saveUpcoming(scheduled);

    expect(loadUpcoming()[0]).toMatchObject({
      operationId: 'operation-1',
      telegramMessageId: 42,
      status: 'scheduled',
    });
  });

  it('recovers Pending records after a restart', () => {
    const pending = createPending('operation-1');
    saveUpcoming([pending]);

    const restored = loadUpcoming();

    expect(getPendingSchedules(restored)).toEqual([pending]);
  });

  it('reuses an existing Telegram scheduled message instead of creating a duplicate', () => {
    const existing = {
      id: 'telegram-1',
      message: 'Send the update',
      date: 1893492000,
    };

    expect(
      findMatchingScheduledMessage(
        [existing],
        'Send the update',
        1893492000
      )
    ).toEqual(existing);
  });

  it('keeps the Pending record when scheduling fails', () => {
    const pending = createPending('operation-1');
    const unchanged = applyScheduleResult(
      [pending],
      'operation-1',
      { success: false, error: 'Telegram unavailable' }
    );

    saveUpcoming(unchanged);

    expect(loadUpcoming()).toEqual([pending]);
    expect(loadUpcoming()[0].status).toBe('pending');
  });
});
