# Xiaohongshu Content Capture Desktop

Desktop app wrapper for the Xiaohongshu content-capture skill.

## Development

```bash
cd desktop-app
npm install
npm run install-browsers
npm start
```

Build a distributable macOS DMG:

```bash
cd desktop-app
npm install
npm run install-browsers
npm run build:mac
```

The DMG is written to `desktop-app/dist/`.

Build a Windows installer on Windows:

```powershell
cd desktop-app
npm install
npm run install-browsers
npm run build:win
```

The Windows installer is written to `desktop-app/dist/`.

On Apple Silicon Macs, the default output is:

```text
desktop-app/dist/小红书内容简报-0.1.0-arm64.dmg
```

The app opens a local window where users can:

- enter their own Xiaohongshu creator watchlist
- choose Chinese, English, or bilingual output
- choose minimal, normal, or detailed report depth
- start a visible browser collection run
- preview and open the generated Markdown brief
- merge repeated same-day captures into one report and open the historical report index

## Validation

```bash
npm run check
```

This runs JavaScript syntax checks plus Node and Python regression tests without launching the browser.

## Runtime Boundary

The app uses a visible Playwright Chromium window and the user's own local login session. It does not ask for Xiaohongshu passwords, SMS codes, cookies, or session tokens, and it does not bypass CAPTCHA, risk checks, private APIs, or platform rate limits.

## System Requirements

- Node.js 18+
- Python 3 available as `python3`
- Internet access for installing Electron and Playwright dependencies

The report renderer currently reuses the skill's Python script, so Python remains required.

## macOS Distribution Notes

The generated DMG is unsigned by default. Friends may need to right-click the app and choose Open the first time on macOS. For wider distribution, sign and notarize the app with an Apple Developer ID. The current local build target is Apple Silicon (`arm64`); build an additional `x64` DMG if you need to support Intel Macs.

## Windows Distribution Notes

Use `npm run build:win` on a Windows machine, or run the GitHub Actions workflow named `Desktop Build`. The generated `.exe` is unsigned by default, so Windows SmartScreen may show a warning the first time. For broad distribution, sign the installer with a code-signing certificate.

Python 3 is still required at runtime for report generation. The app checks `py -3`, `python`, and `python3` on Windows and shows a clear error if Python is missing.
