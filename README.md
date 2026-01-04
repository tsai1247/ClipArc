## Visualized Ctrl+C

Windows tray app that watches the clipboard and shows a playful toss-to-cursor animation whenever you press `Ctrl+C` in any app. Ships as a Windows installer, starts with Windows, and stays in the system tray.

### Features
- Always-on tray app with `Start with Windows` toggle in the tray menu.
- Polls the clipboard (text or image) to detect new copies and shows a mini animation near the cursor.
- Frameless, click-through overlay so it never steals focus.
- Packaged with `electron-builder` → NSIS installer (desktop + start menu shortcuts).

### Develop
```bash
npm install
npm run dev   # launches the Electron app
```

### Build installer
```bash
npm run build
```
The output NSIS installer will be in `dist/`. Run it to install like a normal Windows app; the installer creates shortcuts and keeps the app running from the tray.

### Autostart
- The app enables autostart after installation via `app.setLoginItemSettings` and exposes a `Start with Windows` checkbox in the tray menu so users can toggle it without reinstalling.

### How it works
- `main.js` creates a tray icon, keeps a hidden overlay window alive, and polls the clipboard every ~500ms. When new text or image data appears, it positions the overlay near the mouse cursor and triggers a renderer animation.
- `overlay.html`/`overlay.js` render the copied content, animate it along a parabolic path that shrinks into the cursor, then hide automatically.
- The overlay is transparent, always-on-top, and ignores mouse events so it behaves like a HUD.

### Notes
- Clipboard polling is used instead of a global key hook so it works across apps without elevated privileges. If you need lower latency, lower `POLL_INTERVAL_MS` in `main.js`.
- App and tray icon use `assets/icon.png`. Replace it with your branded asset as needed.
- Future large change (not implemented): replace polling with a global hotkey/clipboard hook to only read the clipboard when `Ctrl+C` happens, reducing CPU and avoiding any mouse jitter at very high copy rates.
