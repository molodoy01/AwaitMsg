const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow = null;

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

require('dotenv').config();

const {
  connectTelegram,
  getChats,
  getContacts,
  resolveChat,
  sendMessage,
  scheduleMessage,
  cancelScheduledMessage,
  setTelegramStatusCallback
} = require('./telegram.cjs');

setTelegramStatusCallback((status) => {
  sendTelegramStatus(status);
});


function createWindow() {
   mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#11110f',

    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  mainWindow.loadURL('http://localhost:5173');
}

ipcMain.handle('telegram-connect', async () => {
  try {
    await connectTelegram();
    return { success: true };
  } catch (error) {
    console.error('Telegram connection error:', error);
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
