const { TelegramClient, Api } = require('teleproto');
const { StringSession } = require('teleproto/sessions');
const {
  loadAccountSecrets,
  saveAccountSecrets,
  getTelegramAuthState: getStoredTelegramAuthState,
  setTelegramSignedOut,
  clearAccountSecrets
} = require('./telegram-account-storage.cjs');
const {
  assertLifecycleRunning,
  beginShutdown,
  createLifecycleState,
  runShared,
  startPendingLogin,
  stopReconnect,
  trackOperation,
  withTimeout: withLifecycleTimeout
} = require('./telegram-lifecycle.cjs');

function normalizeSessionString(value) {
  return typeof value === 'string'
    ? value.trim()
    : '';
}

function getTelegramUserName(user) {
  return [user?.firstName, user?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function updateRuntimeSecretsFromConfig(nextSecrets = loadAccountSecrets()) {
  const apiId = nextSecrets.API_ID;
  const apiHash = nextSecrets.API_HASH;
  const sessionString = normalizeSessionString(nextSecrets.SESSION_STRING);

  return {
    apiId: apiId ? Number(apiId) : undefined,
    apiHash,
    sessionString,
    signedOut: nextSecrets.signedOut === true
  };
}

function getSecretValue(key) {
  const secrets = loadAccountSecrets();
  return secrets[key] || undefined;
}

function createTelegramCore(options = {}) {
  const lifecycleState = createLifecycleState();
  let runtimeApiId = Number(options.apiId ?? getSecretValue('API_ID'));
  let runtimeApiHash = options.apiHash ?? getSecretValue('API_HASH');
  let runtimeSessionString = normalizeSessionString(
    options.sessionString ?? getSecretValue('SESSION_STRING')
  );
  let runtimeSignedOut = false;

function refreshRuntimeSecrets() {
  const next = updateRuntimeSecretsFromConfig(loadAccountSecrets());
  runtimeApiId = Number(next.apiId || 0);
  runtimeApiHash = next.apiHash || '';
  runtimeSessionString = next.sessionString || '';
  runtimeSignedOut = next.signedOut === true;
  return {
    apiId: runtimeApiId,
    apiHash: runtimeApiHash,
    sessionString: runtimeSessionString,
    signedOut: runtimeSignedOut
  };
}

function getTelegramConfig() {
  const secrets = loadAccountSecrets();
  const storedAuthState = typeof getStoredTelegramAuthState === 'function'
    ? getStoredTelegramAuthState()
    : { signedOut: secrets.signedOut, userName: '' };
  const apiId = secrets.API_ID;
  const apiHash = secrets.API_HASH;
  const sessionString = normalizeSessionString(secrets.SESSION_STRING);

  return {
    hasCredentials: Boolean(apiId && apiHash),
    hasSession: Boolean(sessionString),
    signedOut: storedAuthState.signedOut === true,
    userName: storedAuthState.userName || '',
    connected: Boolean(client && client.connected)
  };
}

async function saveTelegramCredentials(data = {}) {
  const rawApiId = data.API_ID ?? data.apiId;
  const rawApiHash = data.API_HASH ?? data.apiHash;
  const rawSession = data.SESSION_STRING ?? data.sessionString;
  const rawUserName = data.userName;

  const secrets = {};

  if (rawApiId !== undefined && rawApiId !== null && rawApiId !== '') {
    secrets.API_ID = String(rawApiId);
  }

  if (rawApiHash !== undefined && rawApiHash !== null && rawApiHash !== '') {
    secrets.API_HASH = String(rawApiHash);
  }

  if (rawSession !== undefined && rawSession !== null && rawSession !== '') {
    secrets.SESSION_STRING = normalizeSessionString(rawSession);
  }

  if (rawUserName !== undefined) {
    secrets.userName = String(rawUserName || '').trim();
  }

  secrets.signedOut = false;

  const saved = saveAccountSecrets(secrets);

  if (saved) {
    refreshRuntimeSecrets();
  }

  return {
    saved,
    config: getTelegramConfig()
  };
}

async function signOutKeepSessionInternal() {
  const clientToClear = client;

  stopTelegramReconnect();
  lifecycleState.loginGeneration += 1;
  client = null;
  lifecycleState.status = 'disconnected';
  await clearPendingLogin();

  if (clientToClear) {
    try {
      await clientToClear.disconnect();
    } catch (error) {
      console.error('Telegram disconnect during sign out failed:', error?.code || error?.name || 'unknown');
      throw error;
    }
  }

  if (!setTelegramSignedOut(true)) {
    throw new Error('Telegram signed-out state could not be saved securely.');
  }

  runtimeSignedOut = true;
  return { signedOut: true, config: getTelegramConfig() };
}

function signOutKeepSession() {
  return trackTelegramOperation('sign-out', signOutKeepSessionInternal);
}

async function forgetTelegramAccountInternal() {
  stopTelegramReconnect();
  lifecycleState.loginGeneration += 1;
  await clearPendingLogin();

  let logoutError = null;
  let clientToClear = client;

  if (!clientToClear && runtimeSessionString) {
    try {
      clientToClear = await connectTelegramInternal({ allowSignedOut: true });
    } catch (error) {
      logoutError = error;
      clientToClear = client;
    }
  }

  client = null;
  lifecycleState.status = 'disconnected';
  stopTelegramReconnect();

  if (clientToClear) {
    try {
      if (clientToClear.connected) {
        await clientToClear.logOut();
      } else {
        await clientToClear.disconnect();
      }
    } catch (error) {
      logoutError = error;
      console.error('Telegram server logout failed; continuing local cleanup:', error?.code || error?.name || 'unknown');
      try {
        await clientToClear.disconnect();
      } catch (disconnectError) {
        console.error('Error disconnecting Telegram client during session clear:', disconnectError?.code || disconnectError?.name || 'unknown');
      }
    }
  }

  const configSaved = clearAccountSecrets();

  if (!configSaved) {
    throw new Error('Telegram session could not be cleared from secure storage.');
  }

  runtimeSessionString = '';
  runtimeSignedOut = false;

  if (logoutError) {
    throw logoutError;
  }

  return { cleared: true, config: getTelegramConfig() };
}

function forgetTelegramAccount() {
  return trackTelegramOperation('forget-account', forgetTelegramAccountInternal);
}

function clearTelegramSession() {
  return forgetTelegramAccount();
}

async function loginUserInternal(params = {}) {
  const apiIdValue = params.API_ID ?? params.apiId ?? getSecretValue('API_ID');
  const apiHashValue = params.API_HASH ?? params.apiHash ?? getSecretValue('API_HASH');
  const phone = params.phoneNumber ?? params.phone ?? '';
  const password = params.password ?? '';
  const code = params.phoneCode ?? '';

  if (!apiIdValue || !apiHashValue) {
    throw new Error('Telegram API credentials are missing. Save API_ID and API_HASH first.');
  }

  const loginApiId = Number(apiIdValue);

  if (!loginApiId) {
    throw new Error('Telegram API_ID must be a valid number.');
  }

  if (!phone) {
    throw new Error('Phone number is required for Telegram login.');
  }

  const loginGeneration = lifecycleState.loginGeneration;

  const pending = lifecycleState.pendingLogin?.value;
  const samePendingLogin =
    pending &&
    pending.phone === phone &&
    pending.apiId === loginApiId &&
    pending.apiHash === String(apiHashValue);

  if (!samePendingLogin) {
    if (pending?.client) {
      throw new Error('Telegram login is already in progress.');
    }

    const loginClient = new TelegramClient(
      new StringSession(''),
      loginApiId,
      String(apiHashValue),
      { connectionRetries: 3 }
    );

    await loginClient.connect();

    if (
      loginGeneration !== lifecycleState.loginGeneration ||
      lifecycleState.status === 'shutting-down' ||
      lifecycleState.status === 'stopped'
    ) {
      await disconnectPendingLogin({ client: loginClient });
      throw new Error('Telegram login was cancelled.');
    }

    const sendCodeResult = await loginClient.sendCode({
      apiId: loginApiId,
      apiHash: String(apiHashValue)
    }, phone);

    if (
      loginGeneration !== lifecycleState.loginGeneration ||
      lifecycleState.status === 'shutting-down' ||
      lifecycleState.status === 'stopped'
    ) {
      await disconnectPendingLogin({ client: loginClient });
      throw new Error('Telegram login was cancelled.');
    }

    startPendingLogin(lifecycleState, {
      client: loginClient,
      phone,
      apiId: loginApiId,
      apiHash: String(apiHashValue),
      phoneCodeHash: sendCodeResult.phoneCodeHash,
      isCodeViaApp: sendCodeResult.isCodeViaApp,
      requiresPassword: false
    }, disconnectPendingLogin);

    if (!code) {
      return {
        requiresCode: true,
        phoneCodeHash: sendCodeResult.phoneCodeHash,
        isCodeViaApp: sendCodeResult.isCodeViaApp,
        nextStep: 'code'
      };
    }
  }

  if (!code) {
    return {
      requiresCode: true,
      phoneCodeHash: lifecycleState.pendingLogin.value.phoneCodeHash,
      isCodeViaApp: lifecycleState.pendingLogin.value.isCodeViaApp,
      nextStep: 'code'
    };
  }

  const pendingLogin = lifecycleState.pendingLogin.value;
  const loginClient = pendingLogin.client;

  try {
    let user;

    if (pendingLogin.requiresPassword) {
      if (!password) {
        return {
          requiresPassword: true,
          nextStep: 'password'
        };
      }

      user = await loginClient.signInWithPassword(
        {
          apiId: loginApiId,
          apiHash: String(apiHashValue)
        },
        {
          password: async () => password,
          onError: async (passwordError) => {
            console.error('Telegram 2FA error:', passwordError?.code || passwordError?.name || 'unknown');
            return true;
          }
        }
      );
    } else {
      try {
        const authorization = await loginClient.invoke(
          new Api.auth.SignIn({
            phoneNumber: pendingLogin.phone,
            phoneCodeHash: pendingLogin.phoneCodeHash,
            phoneCode: code
          })
        );

        user = authorization.user;
      } catch (error) {
        const errorMessage = error?.errorMessage || error?.message || '';

        if (!/SESSION_PASSWORD_NEEDED/i.test(errorMessage)) {
          throw error;
        }

        pendingLogin.requiresPassword = true;

        if (!password) {
          return {
            requiresPassword: true,
            nextStep: 'password'
          };
        }

        user = await loginClient.signInWithPassword(
          {
            apiId: loginApiId,
            apiHash: String(apiHashValue)
          },
          {
            password: async () => password,
            onError: async (passwordError) => {
              console.error('Telegram 2FA error:', passwordError?.code || passwordError?.name || 'unknown');
              return true;
            }
          }
        );
      }
    }

    const session = loginClient.session.save();

    assertTelegramRunning();
    if (loginGeneration !== lifecycleState.loginGeneration) {
      throw new Error('Telegram login was cancelled.');
    }

    const credentialsResult = await saveTelegramCredentials({
      API_ID: loginApiId,
      API_HASH: String(apiHashValue),
      SESSION_STRING: session,
      userName: getTelegramUserName(user),
      signedOut: false
    });

    assertTelegramRunning();
    if (loginGeneration !== lifecycleState.loginGeneration) {
      throw new Error('Telegram login was cancelled.');
    }

    if (!credentialsResult.saved) {
      throw new Error('New Telegram session could not be saved securely.');
    }

    const savedSession = normalizeSessionString(session);

    runtimeSessionString = savedSession;
    runtimeSignedOut = false;
    client = loginClient;
    await clearPendingLogin({ cleanup: false });
    startTelegramReconnect();

    return {
      success: true,
      user,
      session: savedSession,
      requiresCode: false,
      nextStep: 'done'
    };
  } finally {
    if (!pendingLogin && client !== loginClient) {
      try {
        await loginClient.disconnect();
      } catch (error) {
        console.error('Telegram login disconnect cleanup failed:', error?.code || error?.name || 'unknown');
      }
    }
  }
}

function loginUser(params = {}) {
  assertTelegramRunning();

  if (loginPromise) {
    return loginPromise;
  }

  loginPromise = trackTelegramOperation('login', () => loginUserInternal(params))
    .catch(async (error) => {
      await clearPendingLogin();
      throw error;
    })
    .finally(() => {
      loginPromise = null;
    });

  return loginPromise;
}

let client = null;
let loginPromise = null;
let telegramStatusCallback = null;
let invalidSessionCleanupPromise = null;
let shutdownPromise = null;

const REQUEST_TIMEOUT = 15000;
const INVALID_SESSION_MESSAGE = 'Telegram session expired or revoked. Please sign in again.';

function assertTelegramRunning() {
  assertLifecycleRunning(lifecycleState);
}

function trackTelegramOperation(type, operation) {
  return trackOperation(lifecycleState, type, operation);
}

async function disconnectPendingLogin(pending) {
  if (!pending?.client) return;

  try {
    await pending.client.disconnect();
  } catch (error) {
    console.error('Pending Telegram login cleanup failed:', error?.code || error?.name || 'unknown');
  }
}

async function clearPendingLogin(options) {
  const pending = lifecycleState.pendingLogin;
  if (pending) {
    await pending.clear(options);
  }
}

function getTelegramErrorText(error) {
  if (!error) return '';

  return [
    error.code,
    error.errorCode,
    error.errorMessage,
    error.message,
    error.name
  ]
    .filter(Boolean)
    .join(' ');
}

function isInvalidTelegramSessionError(error) {
  const text = getTelegramErrorText(error);

  return /AUTH_KEY_UNREGISTERED|AUTH_KEY_INVALID|SESSION_REVOKED|SESSION_EXPIRED|AUTHORIZATION_REVOKED|AUTHORIZATION_EXPIRED|(?:revoked|expired|invalid)\s+(?:telegram\s+)?(?:session|authorization)|(?:telegram\s+)?(?:session|authorization)\s+(?:revoked|expired|invalid)/i.test(text);
}

async function invalidateTelegramSession() {
  if (invalidSessionCleanupPromise) {
    return invalidSessionCleanupPromise;
  }

  invalidSessionCleanupPromise = (async () => {
    stopTelegramReconnect();

    if (!clearAccountSecrets()) {
      console.error('Invalid Telegram session cleanup write failed.');
    }

    const clientToClear = client;
    client = null;
    lifecycleState.status = 'disconnected';
    lifecycleState.loginGeneration += 1;
    await clearPendingLogin();
    runtimeSessionString = '';

    if (clientToClear) {
      try {
        await clientToClear.disconnect();
      } catch (disconnectError) {
        console.error('Invalid Telegram session disconnect failed:', disconnectError?.code || disconnectError?.name || 'unknown');
      }
    }

    console.log('Telegram reauth required.');
    notifyTelegramStatus({
      status: 'reauth_required',
      connected: false,
      error: INVALID_SESSION_MESSAGE
    });
  })();

  try {
    await invalidSessionCleanupPromise;
  } finally {
    invalidSessionCleanupPromise = null;
  }
}

async function telegramRequest(request) {
  assertTelegramRunning();

  try {
    return await request();
  } catch (error) {
    if (!isInvalidTelegramSessionError(error)) {
      throw error;
    }

    await invalidateTelegramSession();
    const reauthError = new Error(INVALID_SESSION_MESSAGE);
    reauthError.code = 'TELEGRAM_SESSION_INVALID';
    throw reauthError;
  }
}

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
  return withLifecycleTimeout(
    promise,
    timeout,
    operation
  );
}

async function checkInternetConnection() {
  return new Promise((resolve, reject) => {
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

async function reconnectTelegramInternal() {

  assertTelegramRunning();
  lifecycleState.status = 'reconnecting';

  if (!client) {
    return;
  }

  if (lifecycleState.reconnectInProgress) {
    return;
  }

  lifecycleState.reconnectInProgress = true;

  notifyTelegramStatus('reconnecting');

  try {

    try {

      if (client.connected) {
        await client.disconnect();
      }

    } catch (error) {

      console.error('Telegram disconnect during reconnect failed:', error?.code || error?.name || 'unknown');
    }

    await telegramRequest(() => withTimeout(
      client.connect(),
      REQUEST_TIMEOUT,
      'Telegram reconnect'
    ));

    console.log('Telegram reconnected.');

    notifyTelegramStatus('connected');
    lifecycleState.status = 'connected';

    return true;

  } catch (error) {

    if (error?.code === 'TELEGRAM_SESSION_INVALID') {
      throw error;
    }

    console.error('Telegram reconnect failed:', error?.code || error?.name || 'unknown');

    notifyTelegramStatus('disconnected');
    lifecycleState.status = 'disconnected';

    return false;

  } finally {

    lifecycleState.reconnectInProgress = false;
  }
}

function reconnectTelegram() {
  assertTelegramRunning();
  return runShared(lifecycleState, 'connectPromise', () =>
    trackTelegramOperation('reconnect', reconnectTelegramInternal)
  );
}

// =========================================================
// TELEGRAM AUTO RECONNECT WATCHDOG
// =========================================================

function startTelegramReconnect() {

  if (lifecycleState.reconnectTimer || lifecycleState.status === 'shutting-down' || lifecycleState.status === 'stopped') {
    return;
  }

  const watchdogGeneration = lifecycleState.reconnectGeneration;
  const watchdogClient = client;
  let internetWasOffline = false;
  let reconnectDelay = 3000;
  let nextReconnectAt = 0;

  lifecycleState.reconnectTimer = setInterval(async () => {

    if (
      lifecycleState.reconnectGeneration !== watchdogGeneration ||
      client !== watchdogClient ||
      !client
    ) {
      return;
    }

    if (lifecycleState.reconnectInProgress) {
      return;
    }

    try {

      // ===================================================
      // ПРОВЕРКА ИНТЕРНЕТА
      // ===================================================

      await checkInternetConnection();

      if (internetWasOffline) {
        internetWasOffline = false;
        nextReconnectAt = 0;
        reconnectDelay = 3000;
      }

      if (
        !client.connected &&
        Date.now() >= nextReconnectAt &&
        lifecycleState.reconnectGeneration === watchdogGeneration &&
        client === watchdogClient
      ) {
        console.log(
          `Telegram reconnect attempt (backoff ${reconnectDelay} ms)`
        );

        const reconnected = await reconnectTelegram();

        if (reconnected) {
          reconnectDelay = 3000;
          nextReconnectAt = 0;
        } else if (client === watchdogClient) {
          nextReconnectAt = Date.now() + reconnectDelay;
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
        }
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

function stopTelegramReconnect() {
  stopReconnect(lifecycleState);
}

// =========================================================
// CONNECT
// =========================================================

async function connectTelegramInternal({ allowSignedOut = false } = {}) {

  assertTelegramRunning();
  lifecycleState.status = 'connecting';

  refreshRuntimeSecrets();

  if (!runtimeApiId || !runtimeApiHash || !runtimeSessionString) {

    throw new Error(
      'Telegram credentials are missing in the secure Electron userData config'
    );
  }

  if (runtimeSignedOut && !allowSignedOut) {
    const error = new Error('Telegram account is signed out. Welcome back to reconnect.');
    error.code = 'TELEGRAM_SIGNED_OUT';
    lifecycleState.status = 'disconnected';
    throw error;
  }

  // =======================================================
  // УЖЕ ПОДКЛЮЧЕН
  // =======================================================

  if (client && client.connected) {

    notifyTelegramStatus('connected');
    lifecycleState.status = 'connected';

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

    const reconnectGeneration = lifecycleState.reconnectGeneration;
    const clientToReconnect = client;

    try {

      await telegramRequest(() => withTimeout(
        clientToReconnect.connect(),
        REQUEST_TIMEOUT,
        'Telegram reconnect'
      ));

      if (
        reconnectGeneration !== lifecycleState.reconnectGeneration ||
        lifecycleState.status === 'shutting-down' ||
        lifecycleState.status === 'stopped' ||
        client !== clientToReconnect
      ) {
        try {
          await clientToReconnect.disconnect();
        } catch (disconnectError) {
          console.error('Stale Telegram reconnect disconnect failed:', disconnectError?.code || disconnectError?.name || 'unknown');
        }

        throw new Error('Telegram reconnect was cancelled.');
      }

      console.log(
        'Telegram reconnected'
      );

      notifyTelegramStatus('connected');


      startTelegramReconnect();
      lifecycleState.status = 'connected';

      return clientToReconnect;

    } catch (error) {

      console.error('Telegram reconnect error:', error?.code || error?.name || 'unknown');

      if (error?.code !== 'TELEGRAM_SESSION_INVALID') {
        notifyTelegramStatus('disconnected');
      }

      throw error;
    }
  }

  // =======================================================
  // СОЗДАЁМ НОВЫЙ CLIENT
  // =======================================================

  client = new TelegramClient(
    new StringSession(runtimeSessionString),
    runtimeApiId,
    runtimeApiHash,
    {
      connectionRetries: 5
    }
  );

  const connectGeneration = lifecycleState.reconnectGeneration;
  const clientToConnect = client;

  notifyTelegramStatus('connecting');

  await telegramRequest(() => clientToConnect.connect());

  if (
    connectGeneration !== lifecycleState.reconnectGeneration ||
    lifecycleState.status === 'shutting-down' ||
    lifecycleState.status === 'stopped' ||
    client !== clientToConnect
  ) {
    if (client === clientToConnect) {
      client = null;
    }

    try {
      await clientToConnect.disconnect();
    } catch (error) {
      console.error('Stale Telegram client disconnect failed:', error?.code || error?.name || 'unknown');
    }

    throw new Error('Telegram connect was cancelled.');
  }

  console.log(
    'Telegram connected'
  );

  notifyTelegramStatus('connected');
  lifecycleState.status = 'connected';

  startTelegramReconnect();

  return client;
}

function connectTelegram() {
  assertTelegramRunning();
  return runShared(lifecycleState, 'connectPromise', () =>
    trackTelegramOperation('connect', connectTelegramInternal)
  );
}

async function welcomeBackInternal() {
  const connectedClient = await connectTelegramInternal({ allowSignedOut: true });

  if (!setTelegramSignedOut(false)) {
    stopTelegramReconnect();
    client = null;
    lifecycleState.status = 'disconnected';

    try {
      await connectedClient.disconnect();
    } catch (error) {
      console.error('Telegram disconnect after signed-out state failure:', error?.code || error?.name || 'unknown');
    }

    throw new Error('Telegram signed-out state could not be cleared securely.');
  }

  runtimeSignedOut = false;
  return connectedClient;
}

function welcomeBack() {
  assertTelegramRunning();
  return runShared(lifecycleState, 'connectPromise', () =>
    trackTelegramOperation('welcome-back', welcomeBackInternal)
  );
}

async function shutdownTelegram() {
  if (shutdownPromise) return shutdownPromise;

  shutdownPromise = beginShutdown(lifecycleState, async () => {
    await clearPendingLogin();

    const pending = [...lifecycleState.pendingOperations.values()]
      .map((operation) => operation.promise)
      .filter(Boolean);

    if (pending.length > 0) {
      try {
        await withTimeout(
          Promise.allSettled(pending),
          REQUEST_TIMEOUT,
          'Telegram shutdown drain'
        );
      } catch (error) {
        console.error('Telegram shutdown drain timed out. Underlying operations may still be running.');
      }
    }

    const clientToClear = client;
    client = null;
    runtimeSessionString = '';

    if (clientToClear) {
      try {
        await clientToClear.disconnect();
      } catch (error) {
        console.error('Telegram shutdown disconnect failed:', error?.code || error?.name || 'unknown');
      }
    }

    console.log('Telegram disconnected.');
    notifyTelegramStatus({ status: 'disconnected', connected: false });
  });

  return shutdownPromise;
}

// =========================================================
// GET CHATS
// =========================================================

async function getChatAvatarDataUrl(entity) {
  if (!entity) return '';

  try {
    const avatar = await telegramRequest(() => withTimeout(
      client.downloadProfilePhoto(entity),
      REQUEST_TIMEOUT,
      'Loading Telegram chat avatar'
    ));

    if (avatar && (Buffer.isBuffer(avatar) || avatar instanceof Uint8Array)) {
      return `data:image/jpeg;base64,${Buffer.from(avatar).toString('base64')}`;
    }
  } catch (error) {
    console.error('Telegram chat avatar unavailable:', error?.code || error?.name || 'unknown');
  }

  return '';
}

async function getChatsInternal() {

  if (!client) {
    await connectTelegram();
  }

  const dialogs = await telegramRequest(() => client.getDialogs({
    limit: 100
  }));

  const chats = dialogs.map((dialog) => {
    const entity = dialog?.entity || null;

    return {
      id: dialog.id?.toString(),
      name: dialog.name || getEntityDisplayName(entity),
      username: entity?.username || '',
      type: getPublicChatType(entity) || 'private'
    };
  });

  try {

    const me = await telegramRequest(() => client.getMe());

    const myId = me.id?.toString();

    if (myId) {

      const filteredChats = chats.filter(
        (chat) => chat.id !== myId
      );

      filteredChats.unshift({
        id: myId,
        name: 'Saved Messages',
        username: '',
        type: 'private',
        avatarDataUrl: ''
      });

      return filteredChats;
    }

  } catch (error) {

    if (error?.code === 'TELEGRAM_SESSION_INVALID') {
      throw error;
    }

    console.error('Failed to add Saved Messages:', error?.code || error?.name || 'unknown');
  }

  return chats;
}

function getChats() {
  return trackTelegramOperation('getChats', getChatsInternal);
}

async function getChatAvatarInternal(chatId) {
  if (!client) await connectTelegram();
  const entity = await telegramRequest(() => client.getEntity(chatId));
  return getChatAvatarDataUrl(entity);
}

function getChatAvatar(chatId) {
  return trackTelegramOperation('getChatAvatar', () => getChatAvatarInternal(chatId));
}

function toPreviewNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

async function getPreviewMedia(message) {
  const file = message.file;
  const media = message.photo
    ? { kind: 'photo' }
    : message.video
      ? { kind: 'video' }
      : message.audio
        ? { kind: 'audio' }
        : message.document
          ? { kind: 'document' }
          : null;

  if (!media) return undefined;

  const result = {
    ...media,
    name: file?.name || '',
    mimeType: file?.mimeType || '',
    size: toPreviewNumber(file?.size),
    duration: toPreviewNumber(file?.duration),
    width: toPreviewNumber(file?.width),
    height: toPreviewNumber(file?.height)
  };

  if (media.kind === 'photo' || media.kind === 'video') {
    try {
      const thumbnail = await message.downloadMedia({ thumb: 1 });

      if (thumbnail && (Buffer.isBuffer(thumbnail) || thumbnail instanceof Uint8Array)) {
        const mimeType = media.kind === 'photo' ? 'image/jpeg' : 'video/jpeg';
        result.thumbnailDataUrl = `data:${mimeType};base64,${Buffer.from(thumbnail).toString('base64')}`;
      }
    } catch (error) {
      console.error('Telegram media thumbnail unavailable:', error?.code || error?.name || 'unknown');
    }
  }

  if (media.kind === 'audio' && result.size && result.size <= 10 * 1024 * 1024) {
    try {
      const audio = await message.downloadMedia();

      if (audio && (Buffer.isBuffer(audio) || audio instanceof Uint8Array)) {
        result.dataUrl = `data:${result.mimeType || 'audio/mpeg'};base64,${Buffer.from(audio).toString('base64')}`;
      }
    } catch (error) {
      console.error('Telegram audio preview unavailable:', error?.code || error?.name || 'unknown');
    }
  }

  return result;
}

async function getChatHistoryInternal(chatId, limit = 50) {
  if (!client) {
    await connectTelegram();
  }

  const target = chatId === 'me' ? 'me' : chatId;
  const entity = await telegramRequest(() => withTimeout(
    client.getEntity(target),
    REQUEST_TIMEOUT,
    'Resolving Telegram chat for history'
  ));
  const messages = await telegramRequest(() => withTimeout(
    client.getMessages(entity, { limit }),
    REQUEST_TIMEOUT,
    'Loading Telegram chat history'
  ));

  let avatarDataUrl = '';

  try {
    const avatar = await telegramRequest(() => withTimeout(
      client.downloadProfilePhoto(entity),
      REQUEST_TIMEOUT,
      'Loading Telegram chat avatar'
    ));

    if (avatar && (Buffer.isBuffer(avatar) || avatar instanceof Uint8Array)) {
      avatarDataUrl = `data:image/jpeg;base64,${Buffer.from(avatar).toString('base64')}`;
    }
  } catch (error) {
    console.error('Telegram chat avatar unavailable:', error?.code || error?.name || 'unknown');
  }

  const normalizedMessages = (await Promise.all([...(messages || [])]
    .filter((message) => message && message.id !== undefined)
    .map(async (message) => {
      const rawDate = message.date instanceof Date
        ? message.date
        : new Date(Number(message.date || 0) * 1000);

      return {
        id: String(message.id),
        text: String(message.message || message.text || ''),
        date: Number.isNaN(rawDate.getTime()) ? new Date(0).toISOString() : rawDate.toISOString(),
        outgoing: message.out === true,
        senderName: getEntityDisplayName(message.sender),
        mediaType: message.media?.className || '',
        mediaName: message.file?.name || '',
        media: await getPreviewMedia(message),
        groupId: message.groupedId ? String(message.groupedId) : ''
      };
    })))
    .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());

  return {
    chat: {
      id: String(entity.id || chatId),
      title: getEntityDisplayName(entity),
      username: entity.username || '',
      type: getPublicChatType(entity) || 'private',
      avatarDataUrl,
      topic: ''
    },
    messages: normalizedMessages
  };
}

function getChatHistory(chatId, limit) {
  return trackTelegramOperation('getChatHistory', () =>
    getChatHistoryInternal(chatId, limit)
  );
}

// =========================================================
// GET TELEGRAM CONTACTS
// =========================================================

async function getContactsInternal() {

  if (!client) {
    await connectTelegram();
  }

  try {

    const result = await telegramRequest(() => client.invoke(
      new Api.contacts.GetContacts({
        hash: 0
      })
    ));

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

    console.error('Failed to get Telegram contacts:', error?.code || error?.name || 'unknown');

    throw error;
  }
}

function getContacts() {
  return trackTelegramOperation('getContacts', getContactsInternal);
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

function getPublicChatType(entity) {
  if (!entity) {
    return null;
  }

  if (entity instanceof Api.User || entity?.className === 'User') {
    return null;
  }

  if (entity instanceof Api.Channel || entity?.className === 'Channel') {
    return entity.megagroup ? 'supergroup' : 'channel';
  }

  if (entity instanceof Api.Chat || entity?.className === 'Chat') {
    return 'group';
  }

  if (entity instanceof Api.ChatForbidden || entity?.className === 'ChatForbidden') {
    return 'group';
  }

  return null;
}

function getEntityDisplayName(entity) {
  if (!entity) {
    return '';
  }

  return (
    entity.title ||
    [entity.firstName, entity.lastName].filter(Boolean).join(' ') ||
    entity.username ||
    'Unnamed chat'
  );
}

async function resolveChatByTitleInDialogs(query) {
  const normalized = normalizeQuery(query);

  if (!normalized) {
    return null;
  }

  let me = null;

  try {
    me = await telegramRequest(() => client.getMe());
  } catch (error) {
    if (error?.code === 'TELEGRAM_SESSION_INVALID') {
      throw error;
    }

    console.error('Could not load Telegram profile for dialog title lookup:', error?.code || error?.name || 'unknown');
  }

  const myId = me?.id?.toString();

  try {
    const dialogs = await telegramRequest(() => withTimeout(
      client.getDialogs({
        limit: 200
      }),
      REQUEST_TIMEOUT,
      'Telegram dialog title lookup'
    ));

    for (const dialog of dialogs || []) {
      const entity = dialog?.entity || null;

      if (!entity) {
        continue;
      }

      const publicType = getPublicChatType(entity);

      if (!publicType) {
        continue;
      }

      if (myId && entity.id?.toString() === myId) {
        continue;
      }

      const name = getEntityDisplayName(entity);

      if (normalizeQuery(name) === normalized) {
        return {
          id: entity.id?.toString(),
          name,
          username: entity.username || '',
          phone: entity.phone || '',
          type: publicType
        };
      }
    }
  } catch (error) {
    if (error?.code === 'TELEGRAM_SESSION_INVALID') {
      throw error;
    }

    console.error('Telegram dialog title lookup failed:', error?.code || error?.name || 'unknown');
  }

  return null;
}

// =========================================================
// RESOLVE TELEGRAM CHAT
// =========================================================

async function resolveChatInternal(query) {

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

  // =======================================================
  // 1. LOAD OWN CONTACTS
  // =======================================================

  let contacts = [];

  try {

    contacts = await getContacts();

  } catch (error) {

    if (error?.code === 'TELEGRAM_SESSION_INVALID') {
      throw error;
    }

    console.error('Could not load Telegram contacts:', error?.code || error?.name || 'unknown');
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
  // 7. DIALOG ENTITY SEARCH BY TITLE
  // =======================================================

  const dialogMatch = await resolveChatByTitleInDialogs(originalQuery);

  if (dialogMatch) {
    return dialogMatch;
  }

  // =======================================================
  // 8. DIRECT TELEGRAM SEARCH
  // =======================================================

  try {

    const entity =
      await telegramRequest(() => withTimeout(
        client.getEntity(
          cleanUsername
        ),
        REQUEST_TIMEOUT,
        'Telegram entity search'
      ));

    if (!entity) {

      throw new Error(
        'Telegram returned no result'
      );
    }

    const type = getPublicChatType(entity);

    if (!type) {
      throw new Error(
        'Resolved Telegram entity is not a public group, supergroup or channel'
      );
    }

    const name =
      getEntityDisplayName(entity);

    const avatarDataUrl = await getChatAvatarDataUrl(entity);

    return {

      id:
        entity.id?.toString(),

      name,

      username:
        entity.username || '',

      phone:
        entity.phone || '',

      type,
      avatarDataUrl

    };

  } catch (error) {

    if (error?.code === 'TELEGRAM_SESSION_INVALID') {
      throw error;
    }

    console.error('Telegram direct search failed:', error?.code || error?.name || 'unknown');

    throw new Error(
      'Could not find Telegram chat: ' +
      originalQuery
    );
  }
}

function resolveChat(query) {
  return trackTelegramOperation('resolveChat', () => resolveChatInternal(query));
}

// =========================================================
// SEND MESSAGE
// =========================================================

function toTelegramFormattingEntities(entities = []) {
  return entities.map((entity) => {
    const range = { offset: entity.offset, length: entity.length };
    switch (entity.type) {
      case 'bold': return new Api.MessageEntityBold(range);
      case 'italic': return new Api.MessageEntityItalic(range);
      case 'underline': return new Api.MessageEntityUnderline(range);
      case 'strikethrough': return new Api.MessageEntityStrike(range);
      case 'text_url': return new Api.MessageEntityTextUrl({ ...range, url: entity.url });
      default: throw new Error('Unsupported formatting entity.');
    }
  });
}

async function sendMessageInternal(
  chatId,
  message,
  attachments = [],
  entities = []
) {

  if (!client) {
    await connectTelegram();
  }

  const target =
    chatId === 'me'
      ? 'me'
      : chatId;

  const clientAtStart = client;

  try {

    const sendOptions = { message };

    if (entities.length > 0) {
      sendOptions.formattingEntities = toTelegramFormattingEntities(entities);
    }

    if (attachments.length > 0) {
      sendOptions.file = attachments.length === 1 ? attachments[0] : attachments;
    }

    await telegramRequest(() => withTimeout(
        clientAtStart.sendMessage(target, sendOptions),
        REQUEST_TIMEOUT,
        'Sending Telegram message'
      ));

    if (client !== clientAtStart) {
      throw new Error('Telegram send was cancelled.');
    }

    return true;

  } catch (error) {

    console.error('Telegram send failed:', error?.code || error?.name || 'unknown');

    throw error;
  }
}

function sendMessage(chatId, message, attachments, entities) {
  return trackTelegramOperation('send', () => sendMessageInternal(chatId, message, attachments, entities));
}

// =========================================================
// SCHEDULE MESSAGE
// =========================================================

async function scheduleMessageInternal(
  chatId,
  message,
  date,
  time,
  targetTimestamp,
  attachments = [],
  entities = []
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

  if (!Number.isFinite(scheduledDate)) {

    throw new Error(
      'Invalid schedule date or time'
    );
  }

  const existingScheduledMessages = await telegramRequest(() => withTimeout(
    client.getScheduledMessages(target),
    REQUEST_TIMEOUT,
    'Checking existing Telegram schedule'
  ));

  const existingScheduledMessage = existingScheduledMessages.find((msg) => {
    const msgTimestamp = msg.date instanceof Date
      ? Math.floor(msg.date.getTime() / 1000)
      : Number(msg.date);

    return (
      msg.message === message &&
      Math.abs(msgTimestamp - scheduledDate) <= 10
    );
  });

  if (existingScheduledMessage) {
    return {
      id: existingScheduledMessage.id,
      telegramMessageId: existingScheduledMessage.id,
      confirmed: true
    };
  }

  const sendOptions = {
    message,
    schedule: scheduledDate
  };

  if (entities.length > 0) {
    sendOptions.formattingEntities = toTelegramFormattingEntities(entities);
  }

  if (attachments.length > 0) {
    sendOptions.file = attachments.length === 1 ? attachments[0] : attachments;
  }

  const sendResult = await telegramRequest(() => withTimeout(
    client.sendMessage(target, sendOptions),
    REQUEST_TIMEOUT,
    'Scheduling Telegram message'
  ));

  let telegramMessageId = null;

  if (
    sendResult &&
    sendResult.id !== undefined &&
    sendResult.id !== null
  ) {

    telegramMessageId =
      sendResult.id;

  }

  const scheduledMessages = await telegramRequest(() => withTimeout(
    client.getScheduledMessages(target),
    REQUEST_TIMEOUT,
    'Verifying scheduled Telegram message'
  ));

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

  console.log('Telegram schedule confirmed.');

  return {

    id:
      confirmedMessage.id,

    telegramMessageId:
      confirmedMessage.id,

    confirmed: true

  };
}

function scheduleMessage(chatId, message, date, time, targetTimestamp, attachments, entities) {
  return trackTelegramOperation('schedule', () => scheduleMessageInternal(
    chatId,
    message,
    date,
    time,
    targetTimestamp,
    attachments,
    entities
  ));
}

// =========================================================
// CANCEL SCHEDULED MESSAGE
// =========================================================

async function cancelScheduledMessageInternal(
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

  const clientAtStart = client;

  let telegramMessageId =
    messageId;

  if (!telegramMessageId) {
    const scheduledMessages =
      await telegramRequest(() => clientAtStart.getScheduledMessages(
        target
      ));

    if (client !== clientAtStart) {
      throw new Error('Telegram cancel was cancelled.');
    }

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

  }

  await telegramRequest(() => clientAtStart.deleteScheduledMessages(
    target,
    [
      Number(telegramMessageId)
    ]
  ));

  if (client !== clientAtStart) {
    throw new Error('Telegram cancel was cancelled.');
  }

  console.log(
    'Scheduled message cancelled successfully'
  );

  return true;
}

function cancelScheduledMessage(chatId, messageId, message, date, time) {
  return trackTelegramOperation('cancel', () => cancelScheduledMessageInternal(
    chatId,
    messageId,
    message,
    date,
    time
  ));
}

// =========================================================
// EXPORTS
// =========================================================

  return {
    getTelegramConfig,
    saveTelegramCredentials,
    signOutKeepSession,
    welcomeBack,
    forgetTelegramAccount,
    clearTelegramSession,
    loginUser,
    connectTelegram,
    getChats,
    getChatAvatar,
    getChatHistory,
    getContacts,
    resolveChat,
    sendMessage,
    scheduleMessage,
    cancelScheduledMessage,
    shutdownTelegram,
    setTelegramStatusCallback,
    lifecycleState
  };
}

const defaultCore = createTelegramCore();

module.exports = {
  createTelegramCore,
  getTelegramConfig: (...args) => defaultCore.getTelegramConfig(...args),
  saveTelegramCredentials: (...args) => defaultCore.saveTelegramCredentials(...args),
  signOutKeepSession: (...args) => defaultCore.signOutKeepSession(...args),
  welcomeBack: (...args) => defaultCore.welcomeBack(...args),
  forgetTelegramAccount: (...args) => defaultCore.forgetTelegramAccount(...args),
  clearTelegramSession: (...args) => defaultCore.clearTelegramSession(...args),
  loginUser: (...args) => defaultCore.loginUser(...args),
  connectTelegram: (...args) => defaultCore.connectTelegram(...args),
  getChats: (...args) => defaultCore.getChats(...args),
  getChatAvatar: (...args) => defaultCore.getChatAvatar(...args),
  getChatHistory: (...args) => defaultCore.getChatHistory(...args),
  getContacts: (...args) => defaultCore.getContacts(...args),
  resolveChat: (...args) => defaultCore.resolveChat(...args),
  sendMessage: (...args) => defaultCore.sendMessage(...args),
  scheduleMessage: (...args) => defaultCore.scheduleMessage(...args),
  cancelScheduledMessage: (...args) => defaultCore.cancelScheduledMessage(...args),
  shutdownTelegram: (...args) => defaultCore.shutdownTelegram(...args),
  setTelegramStatusCallback: (...args) => defaultCore.setTelegramStatusCallback(...args)
};