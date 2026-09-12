import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import security from './ipc-security.cjs';

const {
  validateCancelPayload,
  validateChatId,
  validateLoginPayload,
  validateSchedulePayload,
  validateSendPayload,
  validateTimestamp,
  assertTrustedRenderer
} = security;

describe('IPC security validation', () => {
  const webContents = {};
  const fileUrl = 'file:///app/dist/index.html';

  it('accepts a call from the expected renderer', () => {
    expect(() => assertTrustedRenderer(
      {
        sender: webContents,
        senderFrame: { url: fileUrl }
      },
      webContents,
      fileUrl
    )).not.toThrow();
  });

  it('rejects an unknown sender and a mismatched webContents', () => {
    expect(() => assertTrustedRenderer(
      {
        sender: {},
        senderFrame: { url: fileUrl }
      },
      webContents,
      fileUrl
    )).toThrow('Untrusted renderer');

    expect(() => assertTrustedRenderer(
      {
        sender: webContents,
        senderFrame: { url: 'https://attacker.invalid/' }
      },
      webContents,
      fileUrl
    )).toThrow('Untrusted renderer');
  });

  it('rejects invalid chat IDs, message types, and oversized messages', () => {
    expect(() => validateChatId('username')).toThrow('chatId');
    expect(() => validateSendPayload({ chatId: 'me', message: 42 })).toThrow('message');
    expect(() => validateSendPayload({
      chatId: 'me',
      message: 'x'.repeat(4097)
    })).toThrow('too long');
  });

  it('rejects invalid timestamps and scheduling payloads', () => {
    expect(() => validateTimestamp(1)).toThrow('targetTimestamp');
    expect(() => validateSchedulePayload({
      chatId: 'me',
      message: 'Reminder',
      targetTimestamp: 'tomorrow'
    })).toThrow('targetTimestamp');
  });

  it('validates credentials without returning them as a login result', () => {
    expect(validateLoginPayload({ phoneNumber: '+15550000000' })).toEqual({
      phoneNumber: '+15550000000'
    });
    expect(() => validateLoginPayload({ phoneNumber: '+1', password: 42 })).toThrow('password');
    expect(() => validateCancelPayload({ chatId: 'me', telegramMessageId: 'bad' })).toThrow('telegramMessageId');

    const mainSource = fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), 'main.cjs'),
      'utf8'
    );
    expect(mainSource).toContain('requiresCode: result.requiresCode === true');
    expect(mainSource).not.toContain('session: result.session');
    expect(mainSource).not.toContain('user: result.user');
    expect(mainSource).not.toContain('phoneCodeHash: result.phoneCodeHash');
  });
});