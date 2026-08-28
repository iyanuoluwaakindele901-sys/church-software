const { app, BrowserWindow, ipcMain, screen, session } = require('electron');
const { spawn } = require('node:child_process');
const https = require('node:https');
const path = require('node:path');

const isDev = process.argv.includes('--dev');
const devPort = 5180;
const outputWindows = new Map();
let devServerProcess = null;

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

  createController();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createController();
  });
}).catch((error) => {
  console.error('Sola Worship desktop startup failed:', error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (devServerProcess && !devServerProcess.killed) devServerProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});
