import { describe, expect, it } from 'vitest';
import {
  getMessageCounterTone,
  getMessageMaxLength,
  getRemainingMessageLength,
  MESSAGE_MAX_LENGTH,
  MESSAGE_MAX_LENGTH_WITH_ATTACHMENT,
} from './messageLimits';

describe('message limits', () => {
  it('uses Telegram limits with and without attachments', () => {
    expect(getMessageMaxLength(false)).toBe(MESSAGE_MAX_LENGTH);
    expect(getMessageMaxLength(true)).toBe(MESSAGE_MAX_LENGTH_WITH_ATTACHMENT);
    expect(MESSAGE_MAX_LENGTH).toBe(4096);
    expect(MESSAGE_MAX_LENGTH_WITH_ATTACHMENT).toBe(1024);
  });

  it('never displays a negative remaining count', () => {
    expect(getRemainingMessageLength(1023, 1024)).toBe(1);
    expect(getRemainingMessageLength(1024, 1024)).toBe(0);
    expect(getRemainingMessageLength(1200, 1024)).toBe(0);
  });

  it('changes only the counter tone at the requested thresholds', () => {
    expect(getMessageCounterTone(4096)).toBe('normal');
    expect(getMessageCounterTone(251)).toBe('normal');
    expect(getMessageCounterTone(250)).toBe('warning');
    expect(getMessageCounterTone(101)).toBe('warning');
    expect(getMessageCounterTone(100)).toBe('critical');
    expect(getMessageCounterTone(0)).toBe('critical');
  });

  it('keeps the attachment limit independent from the full message limit', () => {
    expect(getRemainingMessageLength(1024, getMessageMaxLength(true))).toBe(0);
    expect(getRemainingMessageLength(1024, getMessageMaxLength(false))).toBe(3072);
  });
});