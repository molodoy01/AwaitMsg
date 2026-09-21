const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('telegram', {

  getConfig: () =>
    ipcRenderer.invoke('telegram-config'),

  getAuthState: () =>
    ipcRenderer.invoke('telegram-auth-state'),

  signOutKeepSession: () =>
    ipcRenderer.invoke('telegram-sign-out-keep-session'),

  welcomeBack: () =>
    ipcRenderer.invoke('telegram-welcome-back'),

  forgetAccount: () =>
    ipcRenderer.invoke('telegram-forget-account'),

  clearSession: () =>
    ipcRenderer.invoke('telegram-clear-session'),

  login: (data) =>
    ipcRenderer.invoke('telegram-login', data),

  connect: () =>
    ipcRenderer.invoke('telegram-connect'),

  getChats: () =>
    ipcRenderer.invoke('telegram-chats'),

  getChatAvatar: (chatId) =>
    ipcRenderer.invoke('telegram-chat-avatar', chatId),

  findChat: (query) =>
    ipcRenderer.invoke('telegram-find-chat', query),

  getContacts: () =>
    ipcRenderer.invoke('telegram-contacts'),

  getAvailableEffects: () =>
    ipcRenderer.invoke('telegram-effects'),

  send: (chatId, message, attachments = [], entities = [], replyMarkup, silent = false, effect) =>
    ipcRenderer.invoke('telegram-send', {
      chatId,
      message,
      attachments,
      entities,
      replyMarkup,
      silent,
      effect
    }),

  schedule: (data) =>
    ipcRenderer.invoke('telegram-schedule', data),

  getChatHistory: (data) =>
    ipcRenderer.invoke('telegram-chat-history', data),

  getFilePath: (file) =>
    webUtils.getPathForFile(file),

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

contextBridge.exposeInMainWorld('gemini', {
  generate: (prompt, context) =>
    ipcRenderer.invoke('gemini-generate', { prompt, context }),
  getSettings: () =>
    ipcRenderer.invoke('gemini-settings-status'),
  saveKey: (key) =>
    ipcRenderer.invoke('gemini-save-key', key),
  removeKey: () =>
    ipcRenderer.invoke('gemini-remove-key'),
  setEnabled: (enabled) =>
    ipcRenderer.invoke('gemini-set-enabled', enabled)
});
