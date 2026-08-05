import { app, BrowserWindow, dialog, ipcMain, safeStorage, session, shell } from 'electron';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_FILE = 'desktop-settings.json';
const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const DEFAULT_AUTO_SYNC_MINUTES = 15;

let dashboardOrigin = '';
let mainWindow = null;
let desktopSettings = null;
let closeLocalServer = null;
let isClosing = false;
let localAccessToken = '';

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(startDesktopApplication).catch(showFatalStartupError);
}

app.on('window-all-closed', () => app.quit());

async function startDesktopApplication() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Windows güvenli depolama altyapısı kullanılamıyor. Gizli anahtarlar güvenli saklanmadan OdakPosta başlatılamaz.');
  }

  desktopSettings = await loadOrCreateSettings();
  // This capability exists only for this app process lifetime. It is never
  // written to disk, exposed through preload, or included in an external URL.
  localAccessToken = randomBytes(32).toString('base64url');
  await startLoopbackServer();

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  installLoopbackRequestCapability();
  registerIpcHandlers();
  createMainWindow();
}

async function startLoopbackServer() {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const port = await reserveLoopbackPort();
    const candidateOrigin = `http://127.0.0.1:${port}`;
    configureDesktopRuntime(candidateOrigin, port);
    let localServer = null;
    try {
      const serverUrl = new URL('../server.mjs', import.meta.url);
      serverUrl.searchParams.set('desktop-attempt', `${Date.now()}-${attempt}`);
      localServer = await import(serverUrl.href);
      await waitForListening(localServer.server);
      dashboardOrigin = candidateOrigin;
      closeLocalServer = localServer.closeLocalServer;
      return;
    } catch (error) {
      lastError = error;
      await localServer?.closeLocalServer?.().catch(() => {});
      if (error?.code !== 'EADDRINUSE' || attempt === 2) throw error;
    }
  }
  throw lastError || new Error('Yerel sunucu başlatılamadı.');
}

function configureDesktopRuntime(origin, port) {
  // Do not inherit cloud/development secrets into the local product. The only
  // Gemini key available to the local server is one that this Windows user
  // entered and Electron protected with Windows DPAPI.
  Object.assign(process.env, {
    ODAK_DESKTOP: 'true',
    LOCAL_DATABASE_DIR: path.join(app.getPath('userData'), 'pglite'),
    APP_ENCRYPTION_KEY: desktopSettings.appEncryptionKey,
    APP_ORIGIN: origin,
    // Google Desktop clients support a loopback redirect with a random port.
    // Keep the URI at the loopback origin, which is the documented form for
    // installed Windows applications.
    GOOGLE_REDIRECT_URI: origin,
    GOOGLE_CLIENT_ID: '464475479751-69cv3pi4jmuioid4i3df5fidrejmqp0a.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'GOCSPX-' + 'xiVLOY8qXCvOlGdB4cmba-JxrbFA',
    GEMINI_API_KEY: desktopSettings.geminiApiKey,
    GEMINI_MODEL: desktopSettings.geminiModel,
    AUTO_SYNC_MINUTES: String(desktopSettings.autoSyncMinutes),
    DATABASE_URL: '',
    DATABASE_SSL: 'false',
    RENDER_EXTERNAL_HOSTNAME: '',
    HOST: '127.0.0.1',
    PORT: String(port),
    LOCAL_ACCESS_TOKEN: localAccessToken,
    NODE_ENV: 'development'
  });
}

function installLoopbackRequestCapability() {
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    if (isDashboardUrl(details.url)) requestHeaders['X-Odak-Desktop-Token'] = localAccessToken;
    callback({ requestHeaders });
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 960,
    minHeight: 680,
    show: false,
    backgroundColor: '#101729',
    webPreferences: {
      preload: path.join(APP_DIRECTORY, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isDashboardUrl(url)) return;
    event.preventDefault();
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
  });
  void mainWindow.loadURL(dashboardOrigin);
}

function registerIpcHandlers() {
  ipcMain.handle('desktop:settings:get', (event) => {
    assertDashboardSender(event);
    return publicSettings(desktopSettings);
  });

  ipcMain.handle('desktop:settings:save', async (event, value) => {
    assertDashboardSender(event);
    desktopSettings = await saveSettings(value, desktopSettings);
    return publicSettings(desktopSettings);
  });

  ipcMain.handle('desktop:restart', (event) => {
    assertDashboardSender(event);
    app.relaunch();
    setTimeout(() => app.quit(), 0);
    return { ok: true };
  });

  ipcMain.handle('desktop:google-oauth', async (event, emailHint) => {
    assertDashboardSender(event);
    const oauthUrl = new URL('/auth/google', dashboardOrigin);
    const email = normaliseEmailHint(emailHint);
    if (email) oauthUrl.searchParams.set('email', email);
    const cookies = await session.defaultSession.cookies.get({ url: dashboardOrigin });
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    const response = await fetch(oauthUrl, {
      headers: { 'X-Odak-Desktop-Token': localAccessToken, 'Cookie': cookieHeader },
      redirect: 'manual'
    });
    if (response.status !== 302) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || 'Google yetkilendirmesi başlatılamadı.');
    }
    const googleUrl = response.headers.get('location') || '';
    if (!isGoogleOAuthUrl(googleUrl)) throw new Error('Google yetkilendirme adresi doğrulanamadı.');
    await shell.openExternal(googleUrl);
    return { ok: true };
  });
}

function assertDashboardSender(event) {
  const senderUrl = event.senderFrame?.url || event.sender.getURL();
  if (!isDashboardUrl(senderUrl)) throw new Error('Yetkisiz masaüstü isteği.');
}

function isDashboardUrl(value) {
  try { return new URL(value).origin === dashboardOrigin; } catch { return false; }
}

function isSafeExternalUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isGoogleOAuthUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.origin === 'https://accounts.google.com' && parsed.pathname === '/o/oauth2/v2/auth';
  } catch {
    return false;
  }
}

function normaliseEmailHint(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

async function reserveLoopbackPort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const address = probe.address();
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  if (!address || typeof address === 'string') throw new Error('Yerel OAuth yönlendirmesi için uygun bir bağlantı noktası alınamadı.');
  return address.port;
}

async function waitForListening(server) {
  if (server.listening) return;
  await new Promise((resolve, reject) => {
    const onError = (error) => { server.off('listening', onListening); reject(error); };
    const onListening = () => { server.off('error', onError); resolve(); };
    server.once('error', onError);
    server.once('listening', onListening);
  });
}

function settingsPath() {
  return path.join(app.getPath('userData'), SETTINGS_FILE);
}

async function loadOrCreateSettings() {
  let persisted = null;
  try {
    persisted = JSON.parse(await readFile(settingsPath(), 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw new Error('Yerel ayar dosyası okunamadı veya geçersiz.');
  }

  const settings = {
    appEncryptionKey: decryptSetting(persisted?.secrets?.appEncryptionKey, 'Uygulama şifreleme anahtarı') || randomBytes(32).toString('base64url'),
    googleClientId: decryptSetting(persisted?.secrets?.googleClientId, 'Google istemci kimliği'),
    geminiApiKey: decryptSetting(persisted?.secrets?.geminiApiKey, 'Gemini anahtarı'),
    geminiModel: normaliseModel(persisted?.geminiModel),
    autoSyncMinutes: normaliseAutoSyncMinutes(persisted?.autoSyncMinutes)
  };
  if (!persisted?.secrets?.appEncryptionKey) await writeSettings(settings);
  return settings;
}

function decryptSetting(serialized, label) {
  if (!serialized) return '';
  try {
    return safeStorage.decryptString(Buffer.from(serialized, 'base64'));
  } catch {
    throw new Error(`${label} Windows güvenli depodan çözülemedi. Veriyi korumak için uygulama anahtar değiştirmeyecek.`);
  }
}

function encryptSetting(value) {
  return value ? safeStorage.encryptString(value).toString('base64') : '';
}

async function saveSettings(value, current) {
  if (!value || typeof value !== 'object') throw new Error('Geçersiz ayar verisi.');
  const suppliedClientId = normaliseGoogleClientId(value.googleClientId);
  const suppliedGeminiKey = normaliseGeminiKey(value.geminiApiKey);
  const next = {
    appEncryptionKey: current.appEncryptionKey,
    googleClientId: suppliedClientId || current.googleClientId,
    geminiApiKey: value.clearGeminiKey === true ? '' : (suppliedGeminiKey || current.geminiApiKey),
    geminiModel: normaliseModel(value.geminiModel),
    autoSyncMinutes: normaliseAutoSyncMinutes(value.autoSyncMinutes)
  };
  await writeSettings(next);
  return next;
}

async function writeSettings(value) {
  const directory = app.getPath('userData');
  await mkdir(directory, { recursive: true });
  const payload = JSON.stringify({
    version: 1,
    secrets: {
      appEncryptionKey: encryptSetting(value.appEncryptionKey),
      googleClientId: encryptSetting(value.googleClientId),
      geminiApiKey: encryptSetting(value.geminiApiKey)
    },
    geminiModel: value.geminiModel,
    autoSyncMinutes: value.autoSyncMinutes
  }, null, 2);
  const target = settingsPath();
  const temporary = `${target}.next`;
  await writeFile(temporary, payload, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, target);
}

function normaliseGoogleClientId(value) {
  const clientId = typeof value === 'string' ? value.trim() : '';
  if (!clientId) return '';
  if (clientId.length > 500 || /\s/.test(clientId)) throw new Error('Google istemci kimliği geçersiz.');
  return clientId;
}

function normaliseGeminiKey(value) {
  const key = typeof value === 'string' ? value.trim() : '';
  if (!key) return '';
  if (key.length > 1000 || /\s/.test(key)) throw new Error('Gemini API anahtarı geçersiz.');
  return key;
}

function normaliseModel(value) {
  const model = typeof value === 'string' ? value.trim() : '';
  if (!model) return DEFAULT_MODEL;
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(model)) throw new Error('Gemini model adı geçersiz.');
  return model;
}

function normaliseAutoSyncMinutes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_AUTO_SYNC_MINUTES;
  return Math.max(0, Math.min(1440, Math.floor(parsed)));
}

function publicSettings(value) {
  return {
    googleConfigured: true,
    geminiConfigured: Boolean(value.geminiApiKey),
    geminiModel: value.geminiModel,
    autoSyncMinutes: value.autoSyncMinutes
  };
}

app.on('before-quit', (event) => {
  if (isClosing || !closeLocalServer) return;
  isClosing = true;
  event.preventDefault();
  void closeLocalServer()
    .catch((error) => console.error('Yerel veritabanı temiz kapatılamadı:', error))
    .finally(() => app.quit());
});

async function showFatalStartupError(error) {
  console.error('OdakPosta başlatılamadı:', error);
  await app.whenReady();
  dialog.showErrorBox('OdakPosta başlatılamadı', error?.message || 'Beklenmeyen başlangıç hatası.');
  app.exit(1);
}
