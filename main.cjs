const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { app, BrowserWindow, ipcMain, safeStorage, shell } = require('electron');

if (!app.isPackaged && process.env.npm_lifecycle_event !== 'start') {
  require('dotenv').config();
}

const {
  validateCancelPayload,
  validateChatId,
  validateEnabled,
  validateGeminiGeneratePayload,
  validateGeminiKey,
  validateLoginPayload,
  validateQuery,
  validateSchedulePayload,
  validateSendPayload,
  assertTrustedRenderer
} = require('./ipc-security.cjs');

const SECURE_CONFIG_PATH = path.join(
  app.getPath('userData'),
  'awaitmsg-secure-config.json'
);

let mainWindow = null;
let isQuitting = false;

function readSecureConfig() {
  try {
    const raw = fs.readFileSync(SECURE_CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeSecureConfig(data) {
  try {
    fs.writeFileSync(SECURE_CONFIG_PATH, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Secure config write failed:', error?.code || error?.name || 'unknown');
  }
}

const GEMINI_KEY_FIELD = 'GEMINI_API_KEY_ENCRYPTED';
const AI_ASSISTANT_ENABLED_FIELD = 'AI_ASSISTANT_ENABLED';

function getGeminiKey() {
  const config = readSecureConfig();
  const encryptedKey = config[GEMINI_KEY_FIELD];

  if (!encryptedKey || !safeStorage.isEncryptionAvailable()) {
    return '';
  }

  try {
    return safeStorage.decryptString(Buffer.from(encryptedKey, 'base64')).trim();
  } catch (error) {
    console.error('Gemini key decryption failed:', error?.code || error?.name || 'unknown');
    return '';
  }
}

function getGeminiKeyMask(key) {
  return key ? `••••••••${key.slice(-4)}` : '';
}

function getGeminiSettings() {
  const key = getGeminiKey();
  const config = readSecureConfig();
  const enabled = config[AI_ASSISTANT_ENABLED_FIELD] ?? true;

  return {
    hasKey: Boolean(key),
    maskedKey: getGeminiKeyMask(key),
    enabled: enabled === true,
    encryptionAvailable: safeStorage.isEncryptionAvailable()
  };
}

function saveGeminiKey(key) {
  const normalizedKey = typeof key === 'string' ? key.trim() : '';

  if (!normalizedKey) {
    throw new Error('Gemini API key is required.');
  }

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure local storage is unavailable on this system.');
  }

  const config = readSecureConfig();
  const encryptedKey = safeStorage.encryptString(normalizedKey).toString('base64');

  writeSecureConfig({
    ...config,
    [GEMINI_KEY_FIELD]: encryptedKey
  });

  return getGeminiSettings();
}

function removeGeminiKey() {
  const config = readSecureConfig();
  const nextConfig = { ...config };

  delete nextConfig[GEMINI_KEY_FIELD];
  writeSecureConfig(nextConfig);

  return getGeminiSettings();
}

function setGeminiEnabled(enabled) {
  const config = readSecureConfig();
  writeSecureConfig({
    ...config,
    [AI_ASSISTANT_ENABLED_FIELD]: Boolean(enabled)
  });

  return getGeminiSettings();
}

function syncSecureEnv() {
  const config = readSecureConfig();
  const secureConfigExists = fs.existsSync(SECURE_CONFIG_PATH);

  if (config.API_ID) {
    process.env.API_ID = String(config.API_ID);
  }

  if (config.API_HASH) {
    process.env.API_HASH = config.API_HASH;
  }

  if (config.SESSION_STRING) {
    process.env.SESSION_STRING = config.SESSION_STRING;
  } else if (secureConfigExists) {
    process.env.SESSION_STRING = '';
  }
}

function loadProductionSecrets() {
  const config = readSecureConfig();
  const secureConfigExists = fs.existsSync(SECURE_CONFIG_PATH);
  const nextConfig = { ...config };

  if (!nextConfig.API_ID && process.env.API_ID) {
    nextConfig.API_ID = process.env.API_ID;
  }

  if (!nextConfig.API_HASH && process.env.API_HASH) {
    nextConfig.API_HASH = process.env.API_HASH;
  }

  if (!secureConfigExists && !nextConfig.SESSION_STRING && process.env.SESSION_STRING) {
    nextConfig.SESSION_STRING = process.env.SESSION_STRING;
  }

  if (
    (!config.API_ID && nextConfig.API_ID) ||
    (!config.API_HASH && nextConfig.API_HASH) ||
    (!config.SESSION_STRING && nextConfig.SESSION_STRING)
  ) {
    writeSecureConfig(nextConfig);
  }

  if (nextConfig.API_ID) {
    process.env.API_ID = String(nextConfig.API_ID);
  }

  if (nextConfig.API_HASH) {
    process.env.API_HASH = nextConfig.API_HASH;
  }

  if (nextConfig.SESSION_STRING) {
    process.env.SESSION_STRING = nextConfig.SESSION_STRING;
  }
}

loadProductionSecrets();
syncSecureEnv();

function shouldLoadProductionBuild() {
  return app.isPackaged || process.env.npm_lifecycle_event === 'start';
}

function getAppUrl() {
  if (shouldLoadProductionBuild()) {
    return `file://${path.join(__dirname, 'dist', 'index.html')}`;
  }

  return 'http://localhost:5173';
}

function sendTelegramStatus(status) {

  if (
    mainWindow &&
    !mainWindow.isDestroyed()
  ) {

    mainWindow.webContents.send(
      'telegram-status',
      status
    );

  }

}

const {
  connectTelegram,
  loginUser,
  getTelegramConfig,
  clearTelegramSession,
  getChats,
  getContacts,
  resolveChat,
  sendMessage,
  scheduleMessage,
  cancelScheduledMessage,
  shutdownTelegram,
  setTelegramStatusCallback
} = require('./telegram.cjs');
const { generateGeminiContent } = require('./gemini.cjs');

setTelegramStatusCallback((status) => {
  sendTelegramStatus(status);
});

function getGeminiErrorCode(error) {
  const status = error && typeof error === 'object' ? error.status : undefined;
  const details = error instanceof Error ? error.message : String(error);

  if (
    status === 429 ||
    /\b429\b|quota|rate limit|resource exhausted|too many requests/i.test(details)
  ) {
    return 'quota';
  }

  return 'generic';
}


function createWindow() {
   mainWindow = new BrowserWindow({
    title: 'AwaitMsg',
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#11110f',
    autoHideMenuBar: true,

    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'https://aistudio.google.com/app/apikey') {
      shell.openExternal(url);
    }

    return { action: 'deny' };
  });

  const appUrl = getAppUrl();

  if (shouldLoadProductionBuild()) {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  } else {
    mainWindow.loadURL(appUrl);
  }
}

ipcMain.handle('gemini-generate', async (event, data = {}) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  const validated = validateGeminiGeneratePayload(data);

  try {
    const apiKey = getGeminiKey();

    if (!apiKey) {
      return { success: false, errorCode: 'setup_required' };
    }

    const result = await generateGeminiContent(validated.prompt, {
      context: validated.context,
      apiKey
    });

    return {
      success: true,
      intent: result
    };
  } catch (error) {
    console.error('Gemini generation error:', error?.status || error?.code || error?.name || 'unknown');

    return {
      success: false,
      errorCode: getGeminiErrorCode(error)
    };
  }
});

ipcMain.handle('gemini-settings-status', async (event) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  return getGeminiSettings();
});

ipcMain.handle('gemini-save-key', async (event, key) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  const validatedKey = validateGeminiKey(key);

  try {
    return { success: true, settings: saveGeminiKey(validatedKey) };
  } catch (error) {
    console.error('Gemini key save failed:', error?.code || error?.name || 'unknown');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Gemini key could not be saved.'
    };
  }
});

ipcMain.handle('gemini-remove-key', async (event) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  try {
    return { success: true, settings: removeGeminiKey() };
  } catch (error) {
    console.error('Gemini key removal failed:', error?.code || error?.name || 'unknown');
    return { success: false, error: 'Gemini key could not be removed.' };
  }
});

ipcMain.handle('gemini-set-enabled', async (event, enabled) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  const validatedEnabled = validateEnabled(enabled);

  try {
    return { success: true, settings: setGeminiEnabled(validatedEnabled) };
  } catch (error) {
    console.error('AI Assistant setting update failed:', error?.code || error?.name || 'unknown');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'AI Assistant setting could not be updated.'
    };
  }
});

ipcMain.handle('telegram-connect', async (event) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  try {
    await connectTelegram();
    return { success: true };
  } catch (error) {
    console.error('Telegram connection error:', error?.code || error?.name || 'unknown');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('telegram-config', async (event) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  try {
    const config = getTelegramConfig();
    return {
      success: true,
      config: {
        hasCredentials: Boolean(config.hasCredentials),
        hasSession: Boolean(config.hasSession),
        connected: Boolean(config.connected)
      }
    };
  } catch (error) {
    console.error('Telegram config read error:', error?.code || error?.name || 'unknown');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('telegram-clear-session', async (event) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  try {
    const result = await clearTelegramSession();
    return { success: true, ...result };
  } catch (error) {
    console.error('Telegram clear session error:', error?.code || error?.name || 'unknown');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('telegram-login', async (event, data = {}) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  const validated = validateLoginPayload(data);

  try {
    const result = await loginUser(validated);
    return {
      success: true,
      requiresCode: result.requiresCode === true,
      requiresPassword: result.requiresPassword === true,
      nextStep: result.nextStep,
      isCodeViaApp: result.isCodeViaApp === true
    };
  } catch (error) {
    console.error('Telegram login error:', error?.code || error?.name || 'unknown');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('telegram-chats', async (event) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  try {
    const chats = await getChats();
    return { success: true, chats };
  } catch (error) {
    console.error('Telegram chats error:', error?.code || error?.name || 'unknown');
    return { success: false, error: error.message };
  }
});

// -------------------------
// Telegram contacts
// -------------------------

ipcMain.handle('telegram-contacts', async (event) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  try {
    const contacts = await getContacts();

    return {
      success: true,
      contacts
    };

  } catch (error) {
    console.error('Telegram contacts error:', error?.code || error?.name || 'unknown');

    return {
      success: false,
      error: error.message
    };
  }
});


// -------------------------
// Find Telegram chat
// -------------------------

ipcMain.handle('telegram-find-chat', async (event, query) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  const validatedQuery = validateQuery(query);

  try {
    const chat = await resolveChat(validatedQuery);

    return {
      success: true,
      chat
    };

  } catch (error) {
    console.error('Telegram find chat error:', error?.code || error?.name || 'unknown');

    return {
      success: false,
      error: error.message
    };
  }
});


// -------------------------
// Send message
// -------------------------

ipcMain.handle('telegram-send', async (event, data) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  const validated = validateSendPayload(data);

  try {
    await sendMessage(
      validated.chatId,
      validated.message
    );

    return {
      success: true
    };

  } catch (error) {
    console.error('Telegram send error:', error?.code || error?.name || 'unknown');

    return {
      success: false,
      error: error.message
    };
  }
});


// -------------------------
// Schedule message
// -------------------------

ipcMain.handle('telegram-schedule', async (event, data) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  const validated = validateSchedulePayload(data);

  try {
    const result = await scheduleMessage(
      validated.chatId,
      validated.message,
      undefined,
      undefined,
      validated.targetTimestamp
    );

    return {
      success: true,
      telegramMessageId: result.telegramMessageId ?? result.id,
      confirmed: result.confirmed === true
    };

  } catch (error) {
    console.error('Schedule error:', error?.code || error?.name || 'unknown');

    return {
      success: false,
      error: error.message
    };
  }
});

// -------------------------
// Cancel scheduled message
// -------------------------

ipcMain.handle('telegram-cancel', async (event, data) => {
  assertTrustedRenderer(
    event,
    mainWindow?.webContents,
    pathToFileURL(path.join(__dirname, 'dist', 'index.html')).href
  );
  const validated = validateCancelPayload(data);

  try {
    await cancelScheduledMessage(
      validated.chatId,
      validated.telegramMessageId
    );

    return {
      success: true
    };

  } catch (error) {
    console.error('Cancel error:', error?.code || error?.name || 'unknown');

    return {
      success: false,
      error: error.message
    };
  }
});

// -------------------------
// App
// -------------------------

app.whenReady().then(() => {

  console.log('AwaitMsg started.');
  createWindow();

  app.on('activate', () => {

    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }

  });

});


app.on('window-all-closed', () => {

  if (process.platform !== 'darwin') {
    app.quit();
  }

});

app.on('before-quit', (event) => {
  if (isQuitting) return;

  event.preventDefault();
  isQuitting = true;
  console.log('AwaitMsg shutting down.');

  shutdownTelegram()
    .catch((error) => {
      console.error('Telegram shutdown error:', error?.code || error?.name || 'unknown');
    })
    .finally(() => {
      console.log('AwaitMsg shutdown complete.');
      app.exit();
    });
});
