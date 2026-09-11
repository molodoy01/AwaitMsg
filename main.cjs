const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');

const SECURE_CONFIG_PATH = path.join(
  app.getPath('userData'),
  'awaitmsg-secure-config.json'
);

let mainWindow = null;

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
    console.error('Secure config write failed:', error);
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
    console.error('Gemini key decryption failed:', error);
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
  saveTelegramCredentials,
  clearTelegramSession,
  getChats,
  getContacts,
  resolveChat,
  sendMessage,
  scheduleMessage,
  cancelScheduledMessage,
  setTelegramStatusCallback
} = require('./telegram.cjs');
const { generateGeminiContent } = require('./gemini.cjs');

setTelegramStatusCallback((status) => {
  sendTelegramStatus(status);
});

function isTrustedRenderer(event) {
  const senderUrl = event.senderFrame?.url || '';

  return (
    senderUrl.startsWith('file://') ||
    senderUrl.startsWith('http://localhost:5173') ||
    senderUrl.startsWith('http://127.0.0.1:5173')
  );
}

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
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  const appUrl = getAppUrl();

  if (shouldLoadProductionBuild()) {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  } else {
    mainWindow.loadURL(appUrl);
  }
}

ipcMain.handle('gemini-generate', async (event, data = {}) => {
  if (!isTrustedRenderer(event)) {
    return { success: false, error: 'Untrusted renderer.' };
  }

  try {
    const apiKey = getGeminiKey();

    if (!apiKey) {
      return { success: false, errorCode: 'setup_required' };
    }

    const result = await generateGeminiContent(data.prompt, {
      context: data.context,
      apiKey
    });

    return {
      success: true,
      intent: result
    };
  } catch (error) {
    console.error('Gemini generation error:', error);

    return {
      success: false,
      errorCode: getGeminiErrorCode(error)
    };
  }
});

ipcMain.handle('gemini-settings-status', async () => {
  return getGeminiSettings();
});

ipcMain.handle('gemini-save-key', async (event, key) => {
  try {
    return { success: true, settings: saveGeminiKey(key) };
  } catch (error) {
    console.error('Gemini key save failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Gemini key could not be saved.'
    };
  }
});

ipcMain.handle('gemini-remove-key', async () => {
  try {
    return { success: true, settings: removeGeminiKey() };
  } catch (error) {
    console.error('Gemini key removal failed:', error);
    return { success: false, error: 'Gemini key could not be removed.' };
  }
});

ipcMain.handle('gemini-set-enabled', async (event, enabled) => {
  try {
    return { success: true, settings: setGeminiEnabled(enabled === true) };
  } catch (error) {
    console.error('AI Assistant setting update failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'AI Assistant setting could not be updated.'
    };
  }
});

ipcMain.handle('telegram-connect', async () => {
  try {
    await connectTelegram();
    return { success: true };
  } catch (error) {
    console.error('Telegram connection error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('telegram-config', async () => {
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
    console.error('Telegram config read error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('telegram-save-credentials', async (event, data = {}) => {
  try {
    const result = await saveTelegramCredentials(data);
    return { success: true, ...result };
  } catch (error) {
    console.error('Telegram save credentials error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('telegram-clear-session', async () => {
  try {
    const result = await clearTelegramSession();
    return { success: true, ...result };
  } catch (error) {
    console.error('Telegram clear session error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('telegram-login', async (event, data = {}) => {
  try {
    const result = await loginUser(data);
    return { success: true, ...result };
  } catch (error) {
    console.error('Telegram login error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('telegram-chats', async () => {
  try {
    const chats = await getChats();
    return { success: true, chats };
  } catch (error) {
    console.error('Telegram chats error:', error);
    return { success: false, error: error.message };
  }
});

// -------------------------
// Telegram contacts
// -------------------------

ipcMain.handle('telegram-contacts', async () => {
  try {
    const contacts = await getContacts();

    return {
      success: true,
      contacts
    };

  } catch (error) {
    console.error('Telegram contacts error:', error);

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
  try {
    const chat = await resolveChat(query);

    return {
      success: true,
      chat
    };

  } catch (error) {
    console.error('Telegram find chat error:', error);

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
  try {
    await sendMessage(
      data.chatId,
      data.message
    );

    return {
      success: true
    };

  } catch (error) {
    console.error('Telegram send error:', error);

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
  console.log('MAIN: telegram-schedule called', data);

  try {
    const result = await scheduleMessage(
      data.chatId,
      data.message,
      data.date,
      data.time,
      data.targetTimestamp // <--- Передаем точный таймстамп
    );

    console.log(
      'Message scheduled. Telegram ID:',
      result.id
    );

    return {
      success: true,
      telegramMessageId: result.telegramMessageId ?? result.id,
      confirmed: result.confirmed === true
    };

  } catch (error) {
    console.error('Schedule error:', error);

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
  console.log('MAIN: telegram-cancel called', data);

  try {
    await cancelScheduledMessage(
      data.chatId,
      data.telegramMessageId
    );

    return {
      success: true
    };

  } catch (error) {
    console.error('Cancel error:', error);

    return {
      success: false,
      error: error.message
    };
  }
});

// -------------------------
// Test normal message
// -------------------------

ipcMain.handle('telegram-test-send', async (event, data) => {
  console.log('TEST SEND:', data);

  try {
    await sendMessage(data.chatId, data.message);

    console.log('TEST SEND SUCCESS');

    return {
      success: true
    };

  } catch (error) {
    console.error('TEST SEND ERROR:', error);

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
