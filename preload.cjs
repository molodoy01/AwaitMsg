console.log('>>> PRELOAD LOADED <<<');

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('telegram', {

  getConfig: () =>
    ipcRenderer.invoke('telegram-config'),

  saveCredentials: (data) =>
    ipcRenderer.invoke('telegram-save-credentials', data),

  clearSession: () =>
    ipcRenderer.invoke('telegram-clear-session'),

  login: (data) =>
    ipcRenderer.invoke('telegram-login', data),

  connect: () =>
    ipcRenderer.invoke('telegram-connect'),

  getChats: () =>
    ipcRenderer.invoke('telegram-chats'),

  findChat: (query) =>
    ipcRenderer.invoke('telegram-find-chat', query),

  getContacts: () =>
    ipcRenderer.invoke('telegram-contacts'),

  send: (chatId, message) =>
    ipcRenderer.invoke('telegram-send', {
      chatId,
      message
    }),

  testSend: (chatId, message) =>
    ipcRenderer.invoke('telegram-test-send', {
      chatId,
      message
    }),

  schedule: (data) =>
    ipcRenderer.invoke('telegram-schedule', data),

  cancel: (data) =>
    ipcRenderer.invoke('telegram-cancel', data),

  onStatus: (callback) => {

    ipcRenderer.on(
      'telegram-status',
      (event, status) => {

        if (typeof callback === 'function') {
          callback(status);
        }

      }
    );

  }

});
