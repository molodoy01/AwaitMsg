const { contextBridge, ipcRenderer } = require('electron');

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

  findChat: (query) =>
    ipcRenderer.invoke('telegram-find-chat', query),

  getContacts: () =>
    ipcRenderer.invoke('telegram-contacts'),

  send: (chatId, message) =>
    ipcRenderer.invoke('telegram-send', {
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
