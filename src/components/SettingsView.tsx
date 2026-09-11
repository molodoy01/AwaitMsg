import { useEffect, useState } from 'react';

type GeminiSettings = {
  hasKey: boolean;
  maskedKey: string;
  enabled: boolean;
  encryptionAvailable: boolean;
};

type SettingsViewProps = {
  onClose: () => void;
  connected: boolean;
  geminiSettings: GeminiSettings;
  settingsKey: string;
  settingsBusy: boolean;
  settingsError: string;
  onSettingsKeyChange: (value: string) => void;
  onSaveGeminiKey: () => void;
  onRemoveGeminiKey: () => void;
  onToggleAssistant: () => void;
};

export function SettingsView({
  onClose,
  connected,
  geminiSettings,
  settingsKey,
  settingsBusy,
  settingsError,
  onSettingsKeyChange,
  onSaveGeminiKey,
  onRemoveGeminiKey,
  onToggleAssistant,
}: SettingsViewProps) {
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [isConfirmingRemoval, setIsConfirmingRemoval] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="settings-view">
      <header className="settings-view-header">
        <div className="settings-view-logo">AWAITMSG</div>

        <span className={`settings-telegram-status ${connected ? 'is-connected' : 'is-disconnected'}`}>
          <span className="settings-status-dot" aria-hidden="true" />
          Telegram {connected ? 'CONNECTED' : 'DISCONNECTED'}
        </span>

        <button
          type="button"
          className="settings-view-done"
          onClick={onClose}
        >
          Done
        </button>
      </header>

      <main className="settings-view-content">
        <h1>Settings</h1>

        <div className="settings-sections">
          <section className="settings-view-section">
            <h2>AI Assistant</h2>
            <p className="settings-view-description">
              Create scheduled messages from natural language.
            </p>
            <button
              type="button"
              className={`settings-toggle-line ${geminiSettings.enabled ? 'is-on' : ''}`}
              onClick={onToggleAssistant}
              disabled={settingsBusy}
              aria-pressed={geminiSettings.enabled}
            >
              <span>AI Assistant</span>
              <span className={`settings-toggle-state ${geminiSettings.enabled ? 'is-on' : 'is-off'}`}>
                {geminiSettings.enabled ? 'ON' : 'OFF'}
              </span>
            </button>
          </section>

          <section className="settings-view-section">
            <div className="settings-section-heading-row">
              <h2>Gemini API Key</h2>
              <span className={`settings-status ${geminiSettings.hasKey ? 'is-ready' : 'is-missing'}`}>
                {geminiSettings.hasKey ? 'KEY READY' : 'NO KEY'}
              </span>
            </div>
            <p className="settings-view-description">Your key, your quota.</p>

            {isEditingKey ? (
              <form
                className="settings-key-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  onSaveGeminiKey();
                  setIsEditingKey(false);
                }}
              >
                <input
                  type="password"
                  value={settingsKey}
                  onChange={(event) => onSettingsKeyChange(event.target.value)}
                  placeholder="Paste your Gemini API key"
                  autoFocus
                  disabled={settingsBusy}
                />
                <button type="submit" disabled={settingsBusy || !settingsKey.trim()}>
                  Save
                </button>
              </form>
            ) : (
              <div className="settings-key-row">
                <span className="settings-key-value">
                  {geminiSettings.hasKey ? geminiSettings.maskedKey : 'No key yet'}
                </span>
                <span className="settings-key-actions">
                  <button type="button" onClick={() => setIsEditingKey(true)} disabled={settingsBusy}>
                    Change key
                  </button>
                  {geminiSettings.hasKey && (
                    <button
                      type="button"
                      onClick={() => setIsConfirmingRemoval(true)}
                      disabled={settingsBusy}
                    >
                      Remove
                    </button>
                  )}
                </span>
              </div>
            )}

            {isConfirmingRemoval && geminiSettings.hasKey && (
              <div className="settings-remove-confirmation">
                <span>Remove this key?</span>
                <span className="settings-key-actions">
                  <button
                    type="button"
                    onClick={() => setIsConfirmingRemoval(false)}
                    disabled={settingsBusy}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onRemoveGeminiKey();
                      setIsConfirmingRemoval(false);
                    }}
                    disabled={settingsBusy}
                  >
                    Remove key
                  </button>
                </span>
              </div>
            )}

            <a
              className="settings-api-link"
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
            >
              Get API key <span aria-hidden="true">→</span>
            </a>
            {settingsError && <p className="settings-view-error">{settingsError}</p>}
          </section>

          <section className="settings-view-section settings-about-section">
            <h2>About</h2>
            <p className="settings-view-description">
              AwaitMsg keeps your Telegram messages ready
              <br />
              for the right moment.
            </p>
            <p className="settings-version">Version 2.1.0</p>
          </section>
        </div>
      </main>
    </div>
  );
}
