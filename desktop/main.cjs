const { app, BrowserWindow, dialog, ipcMain, safeStorage, screen, session } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const https = require('node:https');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ObsBridge } = require('./obsBridge.cjs');

const isDev = process.argv.includes('--dev');
const devPort = 5180;
const outputWindows = new Map();
let devServerProcess = null;
const obsBridge = new ObsBridge();

function devServerReady() {
  return new Promise((resolve) => {
    const request = https.get(`https://localhost:${devPort}/`, { rejectUnauthorized: false }, (response) => {
      response.resume();
      resolve(true);
    });
    request.setTimeout(800, () => request.destroy());
    request.on('error', () => resolve(false));
  });
}

async function ensureDevServer() {
  if (!isDev || await devServerReady()) return;
  devServerProcess = spawn(process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe', ['/d', '/s', '/c', `npm run dev -- --host 0.0.0.0 --port ${devPort} --strictPort`], {
    cwd: path.join(__dirname, '..'),
    windowsHide: true,
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (await devServerReady()) return;
  }
  throw new Error('The Sola Worship local server did not start.');
}

async function loadApp(win, query = '') {
  if (isDev) {
    await win.loadURL(`https://localhost:${devPort}/${query}`);
    return;
  }
  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { search: query.replace(/^\?/, '') });
}

function chooseOutputDisplay(index = 0) {
  const primary = screen.getPrimaryDisplay();
  const external = screen.getAllDisplays().filter((display) => display.id !== primary.id);
  return external[index % Math.max(external.length, 1)] || null;
}

function createController() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#101010',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  loadApp(win).catch((error) => console.error('Unable to load Sola Worship:', error));
}

app.whenReady().then(async () => {
  await ensureDevServer();
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(['media', 'fullscreen', 'display-capture'].includes(permission));
  });

  // File-backed Electron windows do not always share BroadcastChannel reliably.
  // Relay projector state and WebRTC signaling through the main process instead.
  ipcMain.on('sola:projector-message', (event, message) => {
    for (const target of BrowserWindow.getAllWindows()) {
      if (!target.isDestroyed() && target.webContents.id !== event.sender.id) {
        target.webContents.send('sola:projector-message', message);
      }
    }
  });

  ipcMain.handle('sola:project-output', async (_event, output = {}) => {
    const outputId = String(output.id || 'main');
    const display = chooseOutputDisplay(Number(output.index || 0));
    if (!display) return { ok: false, reason: 'no-secondary-display' };

    const previous = outputWindows.get(outputId);
    if (previous && !previous.isDestroyed()) previous.close();
    const win = new BrowserWindow({
      ...display.bounds,
      frame: false,
      fullscreen: true,
      kiosk: true,
      skipTaskbar: true,
      autoHideMenuBar: true,
      backgroundColor: '#000000',
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    outputWindows.set(outputId, win);
    win.once('ready-to-show', () => {
      win.setBounds(display.bounds);
      win.setFullScreen(true);
      win.setKiosk(true);
      win.setSkipTaskbar(true);
      win.show();
      win.focus();
    });
    win.on('closed', () => outputWindows.delete(outputId));
    await loadApp(win, `?projector=1&output=${encodeURIComponent(outputId)}`);
    return { ok: true, displayId: display.id };
  });

  ipcMain.handle('sola:close-output', (_event, outputId) => {
    const win = outputWindows.get(String(outputId));
    if (win && !win.isDestroyed()) win.close();
    return { ok: true };
  });

  ipcMain.handle('sola:import-media', async (event, destination) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(owner, {
      title: destination === 'theme' ? 'Import theme media' : 'Import media',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images and videos', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'jfif', 'mp4', 'webm', 'mov', 'm4v'] }],
    });
    if (result.canceled) return [];
    const mediaDirectory = path.join(app.getPath('userData'), 'media');
    await fs.mkdir(mediaDirectory, { recursive: true });
    return Promise.all(result.filePaths.map(async (sourcePath) => {
      const extension = path.extname(sourcePath).toLowerCase();
      const baseName = path.basename(sourcePath, extension).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'media';
      const storedPath = path.join(mediaDirectory, `${baseName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`);
      await fs.copyFile(sourcePath, storedPath);
      return {
        name: path.basename(sourcePath),
        kind: ['.mp4', '.webm', '.mov', '.m4v'].includes(extension) ? 'video' : 'image',
        dataUrl: pathToFileURL(storedPath).href,
        storagePath: storedPath,
      };
    }));
  });

  ipcMain.handle('sola:remove-media-file', async (_event, storedPath) => {
    if (!storedPath) return { removed: false };
    const mediaDirectory = path.resolve(app.getPath('userData'), 'media');
    const target = path.resolve(String(storedPath));
    const relative = path.relative(mediaDirectory, target);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid media file path.');
    await fs.unlink(target).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
    return { removed: true };
  });

  ipcMain.handle('sola:obs-connect', (_event, settings) => obsBridge.connect(settings));
  ipcMain.handle('sola:obs-disconnect', () => { obsBridge.disconnect(); return { connected: false }; });
  ipcMain.handle('sola:obs-status', () => obsBridge.status());
  ipcMain.handle('sola:obs-configure-stream', (_event, settings) => obsBridge.configureStream(settings));
  ipcMain.handle('sola:obs-start-stream', () => obsBridge.startStream());
  ipcMain.handle('sola:obs-stop-stream', () => obsBridge.stopStream());
  ipcMain.handle('sola:obs-start-virtual-camera', () => obsBridge.startVirtualCamera());
  ipcMain.handle('sola:obs-stop-virtual-camera', () => obsBridge.stopVirtualCamera());
  ipcMain.handle('sola:save-stream-settings', async (_event, settings = {}) => {
    const settingsFile = path.join(app.getPath('userData'), 'stream-settings.json');
    const publicSettings = {
      host: String(settings.host || '127.0.0.1'),
      port: Number(settings.port) || 4455,
      provider: String(settings.provider || 'youtube'),
      server: String(settings.server || ''),
    };
    if (safeStorage.isEncryptionAvailable()) {
      publicSettings.secrets = safeStorage.encryptString(JSON.stringify({
        password: String(settings.password || ''),
        key: String(settings.key || ''),
      })).toString('base64');
    }
    await fs.writeFile(settingsFile, JSON.stringify(publicSettings, null, 2), 'utf8');
    return { saved: true, secretsSaved: Boolean(publicSettings.secrets) };
  });
  ipcMain.handle('sola:load-stream-settings', async () => {
    const settingsFile = path.join(app.getPath('userData'), 'stream-settings.json');
    try {
      const settings = JSON.parse(await fs.readFile(settingsFile, 'utf8'));
      if (settings.secrets && safeStorage.isEncryptionAvailable()) {
        Object.assign(settings, JSON.parse(safeStorage.decryptString(Buffer.from(settings.secrets, 'base64'))));
      }
      delete settings.secrets;
      return settings;
    } catch {
      return null;
    }
  });

  createController();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createController();
  });
}).catch((error) => {
  console.error('Sola Worship desktop startup failed:', error);
  app.quit();
});

app.on('window-all-closed', () => {
  obsBridge.disconnect();
  if (devServerProcess && !devServerProcess.killed) devServerProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});
