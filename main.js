const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  clipboard,
  nativeImage,
  screen,
} = require("electron");

const path = require("path");
const crypto = require("crypto");

const POLL_INTERVAL_MS = 500;
const ANIMATION_DURATION_MS = 1800;

let tray = null;
let overlayWindow = null;
let lastClipboardSignature = "";
let pollInterval = null;
let hideTimer = null;
let isPaused = false;

function createTray() {
  const iconPath = path.join(__dirname, "assets", "icon.png");
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    { label: "Visualized Ctrl+C", enabled: false },
    {
      label: "Pause animation",
      type: "checkbox",
      checked: isPaused,
      click: (menuItem) => {
        isPaused = menuItem.checked;
        tray.setToolTip(isPaused ? "Visualized Ctrl+C (paused)" : "Visualized Ctrl+C");
      },
    },
    {
      label: "Start with Windows",
      type: "checkbox",
      checked: app.getLoginItemSettings().openAtLogin,
      click: (menuItem) => {
        app.setLoginItemSettings({ openAtLogin: menuItem.checked, path: process.execPath });
      },
    },
    { type: "separator" },
    { label: "Quit", role: "quit" },
  ]);
  tray.setToolTip("Visualized Ctrl+C");
  tray.setContextMenu(contextMenu);
}

function ensureOverlay() {
  if (overlayWindow) {
    return overlayWindow;
  }

  const iconPath = path.join(__dirname, "assets", "icon.png");

  overlayWindow = new BrowserWindow({
    width: 360,
    height: 300,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.loadFile("overlay.html");
  return overlayWindow;
}

function hashImage(image) {
  if (!image || image.isEmpty()) return "";
  try {
    const pngBuffer = image.toPNG();
    const hash = crypto.createHash("sha1").update(pngBuffer).digest("hex");
    const { width, height } = image.getSize();
    return `${width}x${height}:${hash}`;
  } catch (err) {
    return "";
  }
}

function buildSignature(text, image) {
  const normalizedText = text?.trim() || "";
  const textSig = `${normalizedText.length}:${normalizedText.slice(0, 32)}`;
  const imageSig = hashImage(image);
  return `${textSig}::${imageSig}`;
}

function startClipboardPolling() {
  const win = ensureOverlay();
  let lastText = clipboard.readText();
  const initialFormats = clipboard.availableFormats().join("|");
  let lastImage = initialFormats.includes("image") ? clipboard.readImage() : null;
  lastClipboardSignature = buildSignature(lastText, lastImage);

  pollInterval = setInterval(() => {
    if (isPaused) return;

    const formats = clipboard.availableFormats();
    const hasImageFormat = formats.some((f) => f.toLowerCase().includes("image"));

    const currentText = clipboard.readText();
    const currentImage = hasImageFormat ? clipboard.readImage() : null;
    const signature = buildSignature(currentText, currentImage);

    if (signature && signature !== lastClipboardSignature) {
      lastClipboardSignature = signature;
      const isImage = currentImage && !currentImage.isEmpty();
      const content = isImage ? currentImage.toDataURL() : currentText;
      const payload = {
        type: isImage ? "image" : "text",
        content,
      };

      const { x, y } = screen.getCursorScreenPoint();
      const bounds = { x, y };
      win.setBounds({ x: bounds.x - 160, y: bounds.y - 150, width: 360, height: 300 });
      win.showInactive();
      win.webContents.send("show-animation", payload);

      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        win.hide();
        hideTimer = null;
      }, ANIMATION_DURATION_MS + 600);
    }
  }, POLL_INTERVAL_MS);
}

function createApp() {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  app.on("second-instance", () => {
    if (overlayWindow) {
      overlayWindow.showInactive();
    }
  });

  app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });
  createTray();
  ensureOverlay();
  startClipboardPolling();
}

app.whenReady().then(createApp);

app.on("window-all-closed", (event) => {
  // Keep app running in the tray even when overlay is closed.
  event.preventDefault();
});

app.on("before-quit", () => {
  if (pollInterval) clearInterval(pollInterval);
});

ipcMain.on("request-hide", () => {
  if (overlayWindow) {
    overlayWindow.hide();
  }
});
