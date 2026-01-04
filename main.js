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
    { label: "ClipArc", enabled: false },
    {
      label: "Pause animation",
      type: "checkbox",
      checked: isPaused,
      click: (menuItem) => {
        isPaused = menuItem.checked;
        tray.setToolTip(isPaused ? "ClipArc (paused)" : "ClipArc");
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
  tray.setToolTip("ClipArc");
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

function hashBuffer(buffer) {
  if (!buffer || buffer.length === 0) return "";
  try {
    return crypto.createHash("sha1").update(buffer).digest("hex");
  } catch (err) {
    return "";
  }
}

function buildSignature(text, image, filePaths = [], fileBufferSig = "") {
  const normalizedText = text?.trim() || "";
  const textSig = `${normalizedText.length}:${normalizedText.slice(0, 32)}`;
  const imageSig = hashImage(image);
  const filesSig = filePaths.length ? filePaths.map((p) => p.toLowerCase()).join("|") : "";
  return `${textSig}::${imageSig}::${filesSig}::${fileBufferSig}`;
}

function readFilePathsFromClipboard(availableFormats = []) {
  const formats = availableFormats.length ? availableFormats : clipboard.availableFormats();
  const formatsLower = formats.map((f) => f.toLowerCase());
  const hasFileFormat = formatsLower.some(
    (f) => f.includes("filename") || f.includes("filedrop") || f.includes("text/uri-list")
  );

  if (!hasFileFormat) return { paths: [], rawSignature: "" };

  const buffers = [];
  for (const format of ["FileNameW", "FileName"]) {
    try {
      const buffer = clipboard.readBuffer(format);
      if (buffer && buffer.length) {
        buffers.push(buffer);
      }
    } catch (err) {
      // ignore
    }
  }

  let rawSignature = "";
  if (buffers.length) {
    rawSignature = hashBuffer(buffers[0]);
  }

  let paths = [];
  for (const buffer of buffers) {
    const decoded = buffer.toString("ucs2");
    const parsed = decoded.split("\u0000").filter(Boolean);
    paths = paths.concat(parsed);
  }

  if (!paths.length) {
    try {
      const uriList = clipboard.read("text/uri-list");
      if (uriList) {
        const uris = uriList.split(/\r?\n/).filter((line) => line.startsWith("file:///"));
        const parsedUris = uris.map((uri) => decodeURI(uri.replace("file:///", "")));
        paths = paths.concat(parsedUris);
      }
    } catch (err) {
      // ignore
    }
  }

  const uniquePaths = [...new Set(paths)];

  return { paths: uniquePaths, rawSignature };
}

function startClipboardPolling() {
  const win = ensureOverlay();
  const initialFormats = clipboard.availableFormats();
  let lastText = clipboard.readText();
  let lastImage = initialFormats.some((f) => f.toLowerCase().includes("image")) ? clipboard.readImage() : null;
  const { paths: lastFiles, rawSignature: lastFileSig } = readFilePathsFromClipboard(initialFormats);
  lastClipboardSignature = buildSignature(lastText, lastImage, lastFiles, lastFileSig);

  pollInterval = setInterval(() => {
    if (isPaused) return;

    const formats = clipboard.availableFormats();
    const hasImageFormat = formats.some((f) => f.toLowerCase().includes("image"));

    const currentText = clipboard.readText();
    const { paths: currentFilePaths, rawSignature: fileBufferSig } = readFilePathsFromClipboard(formats);
    const currentImage = hasImageFormat ? clipboard.readImage() : null;
    const signature = buildSignature(currentText, currentImage, currentFilePaths, fileBufferSig);

    if (signature && signature !== lastClipboardSignature) {
      lastClipboardSignature = signature;
      const isImage = currentImage && !currentImage.isEmpty();
      let payload;

      if (currentFilePaths.length > 0) {
        payload = {
          type: "files",
          content: currentFilePaths.map((filePath) => path.basename(filePath)),
        };
      } else if (isImage) {
        payload = {
          type: "image",
          content: currentImage.toDataURL(),
        };
      } else {
        payload = {
          type: "text",
          content: currentText,
        };
      }

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
