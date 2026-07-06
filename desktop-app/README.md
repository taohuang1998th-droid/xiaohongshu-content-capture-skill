# Xiaohongshu Content Capture Desktop

Desktop app wrapper for the Xiaohongshu content-capture skill.

## Development

```bash
cd desktop-app
npm install
npm run install-browsers
npm start
```

The app opens a local window where users can:

- enter their own Xiaohongshu creator watchlist
- choose Chinese, English, or bilingual output
- choose minimal, normal, or detailed report depth
- start a visible browser collection run
- preview and open the generated Markdown brief

## Runtime Boundary

The app uses a visible Playwright Chromium window and the user's own local login session. It does not ask for Xiaohongshu passwords, SMS codes, cookies, or session tokens, and it does not bypass CAPTCHA, risk checks, private APIs, or platform rate limits.

## System Requirements

- Node.js 18+
- Python 3 available as `python3`
- Internet access for installing Electron and Playwright dependencies

The report renderer currently reuses the skill's Python script, so Python remains required.
