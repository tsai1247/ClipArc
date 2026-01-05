const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  clipboard,
  nativeImage,
  screen,
  dialog,
} = require("electron");

const path = require("path");
const crypto = require("crypto");
const fs = require("fs");

const POLL_INTERVAL_MS = 500;
const ANIMATION_DURATION_MS = 1800;
const FINAL_ICON_HOLD_MS = 5000;
const IMAGE_SIZE_MIN = 1;
const IMAGE_SIZE_MAX = 100;
const DEFAULT_IMAGE_SIZE = 50;

let tray = null;
let overlayWindow = null;
let lastClipboardSignature = "";
let pollInterval = null;
let hideTimer = null;
let isPaused = false;
let settingsWindow = null;
let animationImageSize = DEFAULT_IMAGE_SIZE;
let launchAtStartup = false;
let settingsDirty = false;
let draftSettings = {
  imageSize: DEFAULT_IMAGE_SIZE,
  launchAtStartup: false,
};

function updateAutoLaunch(enabled) {
  app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath });
}

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function loadSettings() {
  const loginSettings = app.getLoginItemSettings();
  const defaults = {
    imageSize: DEFAULT_IMAGE_SIZE,
    launchAtStartup: loginSettings.openAtLogin,
  };

  try {
    const raw = fs.readFileSync(getSettingsPath(), "utf8");
    const parsed = JSON.parse(raw);
    return { ...defaults, ...parsed };
  } catch (err) {
    return defaults;
  }
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), "utf8");
    settingsDirty = false;
  } catch (err) {
    // ignore
  }
}

function applySettings(settings, { persist } = { persist: false }) {
  const nextSize = clampImageSize(settings.imageSize);
  const nextLaunchAtStartup = Boolean(settings.launchAtStartup);
  animationImageSize = nextSize;
  launchAtStartup = nextLaunchAtStartup;
  draftSettings = { imageSize: animationImageSize, launchAtStartup };
  updateAutoLaunch(launchAtStartup);
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send("settings-updated", draftSettings);
  }
  if (tray) tray.setContextMenu(buildTrayMenu());
  if (persist) {
    saveSettings(draftSettings);
  }
}

function clampImageSize(size) {
  if (typeof size !== "number" || Number.isNaN(size)) return animationImageSize;
  return Math.max(IMAGE_SIZE_MIN, Math.min(IMAGE_SIZE_MAX, Math.round(size)));
}

function getSettingsWindowHtml(currentSize, currentLaunchAtStartup) {
  return `
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <style>
      body {
        margin: 0;
        font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
        background: #0f172a;
        color: #e2e8f0;
        display: flex;
        flex-direction: column;
        height: 100vh;
        overflow: hidden;
      }
      header {
        padding: 18px 22px 10px;
        border-bottom: 1px solid rgba(148, 163, 184, 0.2);
      }
      header h1 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: #f8fafc;
      }
      header p {
        margin: 6px 0 0;
        font-size: 12px;
        opacity: 0.7;
      }
      .layout {
        display: grid;
        grid-template-columns: 160px 1fr;
        min-height: 0;
        flex: 1;
        overflow: hidden;
      }
      .sidebar {
        border-right: 1px solid rgba(148, 163, 184, 0.2);
        padding: 16px 12px;
        background: rgba(15, 23, 42, 0.6);
        overflow: auto;
      }
      .nav-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        border-radius: 8px;
        font-size: 13px;
        color: #e2e8f0;
        background: rgba(56, 189, 248, 0.15);
        border: 1px solid rgba(56, 189, 248, 0.35);
      }
      .content {
        padding: 18px 22px 22px;
        overflow: auto;
      }
      .section {
        display: grid;
        gap: 14px;
      }
      .card {
        background: rgba(15, 23, 42, 0.7);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 12px;
        padding: 16px;
      }
      .label {
        font-size: 12px;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        opacity: 0.7;
      }
      .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-top: 12px;
      }
      .input-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 12px;
      }
      input[type="number"] {
        flex: 1;
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid rgba(148, 163, 184, 0.4);
        background: rgba(15, 23, 42, 0.8);
        color: #f8fafc;
        font-size: 14px;
        outline: none;
      }
      input[type="range"] {
        width: 100%;
        margin-top: 12px;
        accent-color: #38bdf8;
      }
      .value {
        font-size: 13px;
        font-weight: 600;
        color: #f8fafc;
      }
      .checkbox {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .checkbox input {
        width: 16px;
        height: 16px;
        accent-color: #38bdf8;
      }
      button {
        padding: 8px 12px;
        border-radius: 8px;
        border: 0;
        background: #38bdf8;
        color: #0b1120;
        font-weight: 600;
        font-size: 13px;
        cursor: pointer;
      }
      .hint {
        margin-top: 8px;
        font-size: 12px;
        opacity: 0.7;
      }
      footer {
        padding: 14px 22px 18px;
        display: flex;
        justify-content: space-between;
        gap: 10px;
        border-top: 1px solid rgba(148, 163, 184, 0.2);
        background: #0f172a;
        flex-shrink: 0;
      }
      .ghost {
        background: transparent;
        color: #e2e8f0;
        border: 1px solid rgba(148, 163, 184, 0.4);
      }
      .danger {
        background: #f87171;
        color: #0b1120;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>Settings</h1>
      <p>Customize how the animation appears.</p>
    </header>
    <div class="layout">
      <aside class="sidebar">
        <div class="nav-item">Basic</div>
      </aside>
      <main class="content">
        <div class="section">
          <div class="card">
            <div class="label">Size</div>
            <div class="row">
              <div class="value" id="sizeValue">${currentSize}</div>
              <div class="hint">Range ${IMAGE_SIZE_MIN}-${IMAGE_SIZE_MAX}</div>
            </div>
            <input
              type="range"
              id="sizeSlider"
              min="${IMAGE_SIZE_MIN}"
              max="${IMAGE_SIZE_MAX}"
              step="1"
              value="${currentSize}"
            />
          </div>
          <div class="card">
            <div class="label">Startup</div>
            <div class="checkbox">
              <input type="checkbox" id="launchAtStartup" ${currentLaunchAtStartup ? "checked" : ""} />
              <span>Launch at Windows startup</span>
            </div>
          </div>
        </div>
      </main>
    </div>
    <footer>
      <div>
        <button id="restart" class="danger">Restart app</button>
        <button id="quit">Quit app</button>
      </div>
      <div>
        <button id="close" class="ghost">Close</button>
        <button id="save">Save and close</button>
      </div>
    </footer>
    <script>
      const { ipcRenderer } = require("electron");
      const slider = document.getElementById("sizeSlider");
      const sizeValue = document.getElementById("sizeValue");
      const launchAtStartup = document.getElementById("launchAtStartup");
      const saveBtn = document.getElementById("save");
      const closeBtn = document.getElementById("close");
      const restartBtn = document.getElementById("restart");
      const quitBtn = document.getElementById("quit");
      let dirty = false;
      const getState = () => ({
        imageSize: Number(slider.value),
        launchAtStartup: launchAtStartup.checked,
      });
      const markDirty = () => {
        if (dirty) return;
        dirty = true;
        ipcRenderer.send("settings-dirty", true);
      };
      const updateSizeLabel = (val) => {
        sizeValue.textContent = val;
      };
      const emitChange = () => {
        ipcRenderer.send("settings-changed", getState());
      };
      slider.addEventListener("input", () => {
        updateSizeLabel(slider.value);
        markDirty();
        emitChange();
      });
      launchAtStartup.addEventListener("change", () => {
        markDirty();
        emitChange();
      });
      saveBtn.addEventListener("click", () => {
        ipcRenderer.send("save-settings", getState());
        dirty = false;
        ipcRenderer.send("settings-dirty", false);
        window.close();
      });
      window.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          ipcRenderer.send("request-close-settings", { dirty });
        }
      });
      closeBtn.addEventListener("click", () => {
        ipcRenderer.send("request-close-settings", { dirty });
      });
      restartBtn.addEventListener("click", () => {
        ipcRenderer.send("restart-app");
      });
      quitBtn.addEventListener("click", () => {
        ipcRenderer.send("quit-app");
      });
      ipcRenderer.on("settings-updated", (_event, settings) => {
        slider.value = settings.imageSize;
        updateSizeLabel(settings.imageSize);
        launchAtStartup.checked = settings.launchAtStartup;
        dirty = false;
        ipcRenderer.send("settings-dirty", false);
      });
      window.addEventListener("load", () => {
        slider.focus();
      });
    </script>
  </body>
</html>`;
}

function openSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 760,
    height: 620,
    resizable: true,
    show: false,
    title: "ClipArc Settings",
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  settingsWindow.setMenu(null);
  settingsWindow.on("close", (event) => {
    if (!settingsDirty) return;
    event.preventDefault();
    handleSettingsCloseRequest();
  });
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });

  const html = getSettingsWindowHtml(animationImageSize, launchAtStartup);
  settingsWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
  settingsWindow.once("ready-to-show", () => {
    settingsWindow.show();
  });
}

async function handleSettingsCloseRequest() {
  if (!settingsWindow) return;
  if (!settingsDirty) {
    settingsWindow.close();
    return;
  }

  const result = await dialog.showMessageBox(settingsWindow, {
    type: "question",
    buttons: ["Save", "Don't Save", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    message: "Save settings before closing?",
  });

  if (result.response === 0) {
    applySettings(draftSettings, { persist: true });
    settingsWindow.close();
    return;
  }

  if (result.response === 1) {
    settingsDirty = false;
    settingsWindow.close();
  }
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: "ClipArc", enabled: false },
    {
      label: "Pause",
      type: "checkbox",
      checked: isPaused,
      click: (menuItem) => {
        isPaused = menuItem.checked;
        tray.setToolTip(isPaused ? "ClipArc (paused)" : "ClipArc");
      },
    },
    {
      label: `Size: ${animationImageSize}`,
      click: () => openSettingsWindow(),
    },
    {
      label: "Settings",
      click: () => openSettingsWindow(),
    },
    {
      label: "Restart",
      click: () => {
        app.relaunch();
        app.exit(0);
      },
    },
    {
      label: "Quit",
      click: () => app.quit(),
    },
  ]);
}

function createTray() {
  const iconPath = path.join(__dirname, "assets", "icon.png");
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  tray.setToolTip("ClipArc");
  tray.setContextMenu(buildTrayMenu());
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
          imageSize: animationImageSize,
        };
      } else if (isImage) {
        payload = {
          type: "image",
          content: currentImage.toDataURL(),
          imageSize: animationImageSize,
        };
      } else {
        payload = {
          type: "text",
          content: currentText,
          imageSize: animationImageSize,
        };
      }

      const { x, y } = screen.getCursorScreenPoint();
      const scaleFactor = Math.max(1, animationImageSize / DEFAULT_IMAGE_SIZE);
      const width = Math.max(360, Math.round(360 * scaleFactor));
      const height = Math.max(300, Math.round(300 * scaleFactor));
      win.setBounds({ x: x - Math.round(width / 2), y: y - Math.round(height / 2), width, height });
      win.showInactive();
      win.webContents.send("show-animation", payload);

      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        win.hide();
        hideTimer = null;
      }, ANIMATION_DURATION_MS + 600 + FINAL_ICON_HOLD_MS);
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

  const storedSettings = loadSettings();
  applySettings(storedSettings, { persist: false });
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

ipcMain.on("settings-dirty", (_event, isDirty) => {
  settingsDirty = Boolean(isDirty);
});

ipcMain.on("settings-changed", (_event, settings) => {
  draftSettings = {
    imageSize: clampImageSize(settings?.imageSize),
    launchAtStartup: Boolean(settings?.launchAtStartup),
  };
});

ipcMain.on("save-settings", (_event, settings) => {
  applySettings(settings, { persist: true });
});

ipcMain.on("request-close-settings", () => {
  handleSettingsCloseRequest();
});

ipcMain.on("restart-app", () => {
  app.relaunch();
  app.exit(0);
});

ipcMain.on("quit-app", () => {
  app.quit();
});
