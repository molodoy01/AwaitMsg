function normalizeFloodWaitError(error) {
  const source = error instanceof Error ? error : new Error(String(error || 'Telegram request failed.'));
  const sourceText = `${source.code || ''} ${source.message || ''}`;
  const waitMatch = sourceText.match(/FLOOD_WAIT[_\s:]*(\d+)/i);
  const waitSeconds = waitMatch ? Number(waitMatch[1]) : Number(source.seconds);

  if (!Number.isFinite(waitSeconds) || waitSeconds <= 0) return null;

  const normalized = new Error(`Telegram asks to wait ${Math.ceil(waitSeconds)} seconds before trying again.`);
  normalized.code = 'TELEGRAM_FLOOD_WAIT';
  normalized.waitSeconds = Math.ceil(waitSeconds);
  normalized.cause = source;
  return normalized;
}

module.exports = { normalizeFloodWaitError };