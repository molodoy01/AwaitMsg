require('dotenv').config();

const { TelegramClient, Api } = require('teleproto');
const { StringSession } = require('teleproto/sessions');

const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH;
const sessionString = process.env.SESSION_STRING;

let client = null;
let reconnectTimer = null;
let reconnectInProgress = false;
let telegramStatusCallback = null;

const REQUEST_TIMEOUT = 15000;

// =========================================================
// TELEGRAM STATUS
// =========================================================

function setTelegramStatusCallback(callback) {
  telegramStatusCallback = callback;
}

function notifyTelegramStatus(status) {
  if (typeof telegramStatusCallback === 'function') {
    telegramStatusCallback(status);
  }
}

// =========================================================
// TIMEOUT
// =========================================================

function withTimeout(promise, timeout, operation) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            operation +
              ' timed out after ' +
              timeout +
              ' ms'
          )
        );
      }, timeout);
    })
  ]);
}

// =========================================================
// INTERNET CHECK
// =========================================================

async function checkInternetConnection() {
  return new Promise((resolve, reject) => {
    const https = require('https');

    const request = https.get(
      'https://telegram.org',
      {
        timeout: 5000
      },
      (response) => {
        response.resume();

        if (
          response.statusCode >= 200 &&
          response.statusCode < 500
        ) {
          resolve(true);
        } else {
          reject(
            new Error(
              'Internet check failed: HTTP ' +
              response.statusCode
            )
          );
        }
      }
    );

    request.on('error', reject);

    request.on('timeout', () => {
      request.destroy();

      reject(
        new Error(
          'Internet check timeout'
        )
      );
    });
  });
}

// =========================================================
// TELEGRAM FORCE RECONNECT
// =========================================================

async function reconnectTelegram() {

  if (!client) {
    return;
  }

  if (reconnectInProgress) {
    return;
  }

  reconnectInProgress = true;

  notifyTelegramStatus('reconnecting');

  try {

    console.log(
      'Forcing Telegram reconnect...'
    );

    // =====================================================
    // Сначала отключаем старое соединение
    // =====================================================

    try {

      if (client.connected) {

        console.log(
          'Disconnecting old Telegram connection...'
        );

        await client.disconnect();

        console.log(
          'Old Telegram connection disconnected'
        );
      }

    } catch (error) {

      console.error(
        'Telegram disconnect during reconnect failed:',
        error.message
      );
    }

    // =====================================================
    // Подключаем заново
    // =====================================================

    console.log(
      'Connecting Telegram again...'
    );

    await withTimeout(
      client.connect(),
      REQUEST_TIMEOUT,
      'Telegram reconnect'
    );

    console.log(
      'Telegram reconnected successfully'
    );

    notifyTelegramStatus('connected');

    return true;

  } catch (error) {

    console.error(
      'Telegram reconnect failed:',
      error
    );

    notifyTelegramStatus('disconnected');

    return false;

  } finally {

    reconnectInProgress = false;
  }
}

// =========================================================
// TELEGRAM AUTO RECONNECT WATCHDOG
// =========================================================

function startTelegramReconnect() {

  if (reconnectTimer) {
    return;
  }

  let internetWasOffline = false;

   reconnectTimer = setInterval(async () => {

    if (!client) {
      return;
    }

    if (reconnectInProgress) {
     return;
   }

    if (!client) {
      return;
    }

    if (reconnectInProgress) {
      return;
    }

    try {

      // ===================================================
      // ПРОВЕРКА ИНТЕРНЕТА
      // ===================================================

      await checkInternetConnection();

      // ===================================================
      // ИНТЕРНЕТ ВОССТАНОВЛЕН
      // ===================================================

      if (internetWasOffline) {

        console.log(
          'Internet connection restored'
        );

        internetWasOffline = false;

        console.log(
          'Checking Telegram connection...'
        );

        // Не доверяем client.connected.
        // После физического обрыва teleproto может
        // продолжать считать соединение активным.

        await reconnectTelegram();
      }

    } catch (error) {

      // ===================================================
      // ИНТЕРНЕТ ПОТЕРЯН
      // ===================================================

      if (!internetWasOffline) {

        console.log(
          'Internet connection lost'
        );

        notifyTelegramStatus('reconnecting');
      }

      internetWasOffline = true;
    }

  }, 3000);
}

// =========================================================
// CONNECT
// =========================================================

async function connectTelegram() {

  console.log(
    'CONNECT TELEGRAM FUNCTION STARTED'
  );

  if (!apiId || !apiHash || !sessionString) {

    throw new Error(
      'Telegram credentials are missing in .env'
    );
  }

  // =======================================================
  // УЖЕ ПОДКЛЮЧЕН
  // =======================================================

  if (client && client.connected) {

    notifyTelegramStatus('connected');

    return client;
  }

  // =======================================================
  // ПЕРЕПОДКЛЮЧЕНИЕ СУЩЕСТВУЮЩЕГО CLIENT
  // =======================================================

  if (client && !client.connected) {

    console.log(
      'Telegram disconnected. Reconnecting...'
    );

    notifyTelegramStatus('reconnecting');

    try {

      await withTimeout(
        client.connect(),
        REQUEST_TIMEOUT,
        'Telegram reconnect'
      );

      console.log(
        'Telegram reconnected'
      );

      notifyTelegramStatus('connected');


      startTelegramReconnect();

      return client;

    } catch (error) {

      console.error(
        'Telegram reconnect error:',
        error.message
      );

      notifyTelegramStatus('disconnected');

      throw error;
    }
  }

  // =======================================================
  // СОЗДАЁМ НОВЫЙ CLIENT
  // =======================================================

  client = new TelegramClient(
    new StringSession(sessionString),
    apiId,
    apiHash,
    {
      connectionRetries: 5
    }
  );

  notifyTelegramStatus('connecting');

  await client.connect();

  console.log(
    'Telegram connected'
  );

  notifyTelegramStatus('connected');

  console.log(
    'STARTING RECONNECT WATCHDOG'
  );

  startTelegramReconnect();

  return client;
}

// =========================================================
// GET CHATS
// =========================================================

async function getChats() {

  if (!client) {
    await connectTelegram();
  }

  const dialogs = await client.getDialogs({
    limit: 50
  });

  const chats = dialogs.map((dialog) => ({
    id: dialog.id?.toString(),
    name: dialog.name || 'Unnamed chat'
  }));

  try {

    const me = await client.getMe();

    const myId = me.id?.toString();

    if (myId) {

      const filteredChats = chats.filter(
        (chat) => chat.id !== myId
      );

      filteredChats.unshift({
        id: myId,
        name: 'Saved Messages'
      });

      return filteredChats;
    }

  } catch (error) {

    console.error(
      'Failed to add Saved Messages:',
      error
    );
  }

  return chats;
}

// =========================================================
// GET TELEGRAM CONTACTS
// =========================================================

async function getContacts() {

  if (!client) {
    await connectTelegram();
  }

  console.log(
    'Getting Telegram contacts...'
  );

  try {

    const result = await client.invoke(
      new Api.contacts.GetContacts({
        hash: 0
      })
    );

    console.log(
      'Telegram contacts received:',
      result.users?.length || 0
    );

    return (result.users || []).map((user) => ({

      id: user.id?.toString(),

      name:
        [
          user.firstName,
          user.lastName
        ]
          .filter(Boolean)
          .join(' ') ||
        'Unnamed contact',

      username: user.username || '',
      phone: user.phone || ''

    }));

  } catch (error) {

    console.error(
      'Failed to get Telegram contacts:',
      error
    );

    throw error;
  }
}

// =========================================================
// NORMALIZE SEARCH QUERY
// =========================================================

function normalizeQuery(value) {

  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(
      /^https?:\/\/t\.me\//i,
      ''
    )
    .replace(
      /^t\.me\//i,
      ''
    )
    .replace(
      /^@/,
      ''
    )
    .split('?')[0]
    .split('#')[0]
    .replace(
      /\/$/,
      ''
    )
    .trim();
}

// =========================================================
// NORMALIZE PHONE
// =========================================================

function normalizePhone(value) {

  return String(value || '')
    .replace(/\D/g, '');
}

// =========================================================
// RESOLVE TELEGRAM CHAT
// =========================================================

async function resolveChat(query) {

  if (!client) {
    await connectTelegram();
  }

  const originalQuery =
    String(query || '').trim();

  if (!originalQuery) {

    throw new Error(
      'Username, name or phone is empty'
    );
  }

  console.log(
    '================================'
  );

  console.log(
    'Resolving Telegram chat:',
    originalQuery
  );

  // =======================================================
  // 1. LOAD OWN CONTACTS
  // =======================================================

  let contacts = [];

  try {

    contacts = await getContacts();

  } catch (error) {

    console.error(
      'Could not load Telegram contacts:',
      error
    );
  }

  const normalized =
    normalizeQuery(originalQuery);

  const normalizedPhone =
    normalizePhone(originalQuery);

  // =======================================================
  // 2. SEARCH BY PHONE
  // =======================================================

  if (normalizedPhone.length >= 5) {

    const phoneMatch = contacts.find(
      (contact) => {

        const contactPhone =
          normalizePhone(contact.phone);

        return (
          contactPhone &&
          contactPhone === normalizedPhone
        );
      }
    );

    if (phoneMatch) {

      console.log(
        'Contact found by phone:',
        phoneMatch
      );

      return {

        id: String(phoneMatch.id),

        name: phoneMatch.name,

        username:
          phoneMatch.username || '',

        phone:
          phoneMatch.phone || ''

      };
    }
  }

  // =======================================================
  // 3. SEARCH BY USERNAME
  // =======================================================

  const usernameMatch =
    contacts.find(
      (contact) => {

        const username =
          String(
            contact.username || ''
          )
            .trim()
            .toLowerCase()
            .replace(
              /^@/,
              ''
            );

        return (
          username &&
          username === normalized
        );
      }
    );

  if (usernameMatch) {

    console.log(
      'Contact found by username:',
      usernameMatch
    );

    return {

      id: String(usernameMatch.id),

      name: usernameMatch.name,

      username:
        usernameMatch.username || '',

      phone:
        usernameMatch.phone || ''

    };
  }

  // =======================================================
  // 4. SEARCH BY FULL NAME
  // =======================================================

  const nameMatch =
    contacts.find(
      (contact) => {

        const name =
          String(
            contact.name || ''
          )
            .trim()
            .toLowerCase();

        return name === normalized;
      }
    );

  if (nameMatch) {

    console.log(
      'Contact found by name:',
      nameMatch
    );

    return {

      id: String(nameMatch.id),

      name: nameMatch.name,

      username:
        nameMatch.username || '',

      phone:
        nameMatch.phone || ''

    };
  }

  // =======================================================
  // 5. SEARCH BY PARTIAL NAME
  // =======================================================

  const partialNameMatch =
    contacts.find(
      (contact) => {

        const name =
          String(
            contact.name || ''
          )
            .trim()
            .toLowerCase();

        return (
          name &&
          normalized &&
          name.includes(normalized)
        );
      }
    );

  if (partialNameMatch) {

    console.log(
      'Contact found by partial name:',
      partialNameMatch
    );

    return {

      id:
        String(partialNameMatch.id),

      name:
        partialNameMatch.name,

      username:
        partialNameMatch.username || '',

      phone:
        partialNameMatch.phone || ''

    };
  }

  // =======================================================
  // 6. CLEAN USERNAME
  // =======================================================

  const cleanUsername =
    normalizeQuery(originalQuery);

  if (!cleanUsername) {

    throw new Error(
      'Invalid Telegram username or link'
    );
  }

  // =======================================================
  // 7. DIRECT TELEGRAM SEARCH
  // =======================================================

  console.log(
    'User not found in contacts.'
  );

  console.log(
    'Searching Telegram directly:',
    cleanUsername
  );

  try {

    const entity =
      await withTimeout(
        client.getEntity(
          cleanUsername
        ),
        REQUEST_TIMEOUT,
        'Telegram entity search'
      );

    if (!entity) {

      throw new Error(
        'Telegram returned no result'
      );
    }

    const name =
      entity.title ||
      [
        entity.firstName,
        entity.lastName
      ]
        .filter(Boolean)
        .join(' ') ||
      entity.username ||
      'Unnamed chat';

    console.log(
      'Telegram chat found:',
      name
    );

    console.log(
      'Telegram entity ID:',
      entity.id?.toString()
    );

    console.log(
      'Telegram username:',
      entity.username || ''
    );

    return {

      id:
        entity.id?.toString(),

      name,

      username:
        entity.username || '',

      phone:
        entity.phone || ''

    };

  } catch (error) {

    console.error(
      'Telegram direct search failed:',
      error
    );

    throw new Error(
      'Could not find Telegram chat: ' +
      originalQuery
    );
  }
}

// =========================================================
// SEND MESSAGE
// =========================================================

async function sendMessage(
  chatId,
  message
) {

  if (!client) {
    await connectTelegram();
  }

  console.log(
    'SEND DEBUG chatId:',
    chatId
  );

  console.log(
    'SEND DEBUG type:',
    typeof chatId
  );

  console.log(
    'SEND DEBUG message:',
    message
  );

  const target =
    chatId === 'me'
      ? 'me'
      : chatId;

  console.log(
    'SEND DEBUG target:',
    target
  );

  try {

    const result =
      await withTimeout(
        client.sendMessage(
          target,
          {
            message
          }
        ),
        REQUEST_TIMEOUT,
        'Sending Telegram message'
      );

    console.log(
      'SEND RESULT:',
      result
    );

    console.log(
      'Message sent:',
      target
    );

    return true;

  } catch (error) {

    console.error(
      'SEND ERROR:',
      error
    );

    throw error;
  }
}

// =========================================================
// SCHEDULE MESSAGE
// =========================================================

async function scheduleMessage(
  chatId,
  message,
  date,
  time,
  targetTimestamp
) {

  if (!client) {
    await connectTelegram();
  }

  const target =
    chatId === 'me'
      ? 'me'
      : chatId;

  const scheduledDate =
    typeof targetTimestamp === 'number' &&
    Number.isFinite(targetTimestamp)
      ? targetTimestamp
      : Math.floor(
          new Date(
            date + 'T' + time
          ).getTime() / 1000
        );

  console.log(
    '===== SCHEDULE TIME DEBUG ====='
  );

  console.log(
    'Input date:',
    date
  );

  console.log(
    'Input time:',
    time
  );

  console.log(
    'Target timestamp passed:',
    targetTimestamp
  );

  console.log(
    'Unix timestamp used:',
    scheduledDate
  );

  console.log(
    '================================'
  );

  if (!Number.isFinite(scheduledDate)) {

    throw new Error(
      'Invalid schedule date or time'
    );
  }

  console.log(
    '-------------------------'
  );

  console.log(
    'Scheduling message'
  );

  console.log(
    'Target:',
    target
  );

  console.log(
    'Message:',
    message
  );

  console.log(
    'Date:',
    date
  );

  console.log(
    'Time:',
    time
  );

  console.log(
    'Timestamp:',
    scheduledDate
  );

  const sendResult =
    await withTimeout(
      client.sendMessage(
        target,
        {
          message,
          schedule: scheduledDate
        }
      ),
      REQUEST_TIMEOUT,
      'Scheduling Telegram message'
    );

  console.log(
    'Message added to Telegram schedule'
  );

  let telegramMessageId = null;

  if (
    sendResult &&
    sendResult.id !== undefined &&
    sendResult.id !== null
  ) {

    telegramMessageId =
      sendResult.id;

    console.log(
      'Telegram scheduled message ID:',
      telegramMessageId
    );
  }

  console.log(
    'Verifying Telegram scheduled message...'
  );

  const scheduledMessages =
    await withTimeout(
      client.getScheduledMessages(
        target
      ),
      REQUEST_TIMEOUT,
      'Verifying scheduled Telegram message'
    );

  console.log(
    'Telegram scheduled messages:',
    scheduledMessages.map(
      (msg) => ({
        id: msg.id,
        message: msg.message,
        date: msg.date
      })
    )
  );

  let confirmedMessage = null;

  if (telegramMessageId !== null) {

    confirmedMessage =
      scheduledMessages.find(
        (msg) =>
          String(msg.id) ===
          String(telegramMessageId)
      );
  }

  if (!confirmedMessage) {

    confirmedMessage =
      scheduledMessages.find(
        (msg) => {

          const msgTimestamp =
            msg.date instanceof Date
              ? Math.floor(
                  msg.date.getTime() /
                    1000
                )
              : Number(msg.date);

          return (
            msg.message === message &&
            Math.abs(
              msgTimestamp -
              scheduledDate
            ) <= 10
          );
        }
      );
  }

  if (!confirmedMessage) {

    console.error(
      'Telegram did not confirm the scheduled message.'
    );

    throw new Error(
      'Telegram did not confirm that the reminder was saved.'
    );
  }

  console.log(
    'TELEGRAM SCHEDULE CONFIRMED'
  );

  console.log(
    'Confirmed Telegram message ID:',
    confirmedMessage.id
  );

  console.log(
    '-------------------------'
  );

  return {

    id:
      confirmedMessage.id,

    telegramMessageId:
      confirmedMessage.id,

    confirmed: true

  };
}

// =========================================================
// CANCEL SCHEDULED MESSAGE
// =========================================================

async function cancelScheduledMessage(
  chatId,
  messageId,
  message,
  date,
  time
) {

  if (!client) {
    await connectTelegram();
  }

  const target =
    chatId === 'me'
      ? 'me'
      : chatId;

  console.log(
    '-------------------------'
  );

  console.log(
    'Cancelling scheduled message'
  );

  console.log(
    'Target:',
    target
  );

  console.log(
    'Message ID:',
    messageId
  );

  let telegramMessageId =
    messageId;

  if (!telegramMessageId) {

    console.log(
      'Telegram ID missing. Searching scheduled messages...'
    );

    const scheduledMessages =
      await client.getScheduledMessages(
        target
      );

    const targetTimestamp =
      Math.floor(
        new Date(
          date + 'T' + time
        ).getTime() / 1000
      );

    const foundMessage =
      scheduledMessages.find(
        (msg) => {

          const msgTimestamp =
            msg.date instanceof Date
              ? Math.floor(
                  msg.date.getTime() /
                    1000
                )
              : Number(msg.date);

          return (
            msg.message === message &&
            Math.abs(
              msgTimestamp -
              targetTimestamp
            ) <= 10
          );
        }
      );

    if (!foundMessage) {

      throw new Error(
        'Scheduled message was not found in Telegram.'
      );
    }

    telegramMessageId =
      foundMessage.id;

    console.log(
      'Found Telegram message ID:',
      telegramMessageId
    );
  }

  await client.deleteScheduledMessages(
    target,
    [
      Number(telegramMessageId)
    ]
  );

  console.log(
    'Scheduled message cancelled successfully'
  );

  console.log(
    '-------------------------'
  );

  return true;
}

// =========================================================
// EXPORTS
// =========================================================

module.exports = {

  connectTelegram,

  getChats,

  getContacts,

  resolveChat,

  sendMessage,

  scheduleMessage,

  cancelScheduledMessage,

  setTelegramStatusCallback

};