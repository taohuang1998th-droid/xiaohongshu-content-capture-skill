# Xiaohongshu Content Capture Skill

Codex skill for capturing and analyzing Xiaohongshu/REDnote creator content from a user-authorized visible browser session or user-provided exports.

## Install

Install the skill from this repository:

```bash
python3 ~/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py \
  --repo taohuang1998th-droid/xiaohongshu-content-capture-skill \
  --path skills/xiaohongshu-content-capture
```

If direct download fails because of local Python certificate settings, use the git method:

```bash
python3 ~/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py \
  --repo taohuang1998th-droid/xiaohongshu-content-capture-skill \
  --path skills/xiaohongshu-content-capture \
  --method git
```

Restart Codex after installation so the new skill is discovered.

## First Run

The skill ships with no default creators. On first use, it prompts for Xiaohongshu creator handles and saves them to `config/creators.txt`.

The report can be generated in Chinese, English, or bilingual form, and in minimal, normal, or detailed form:

```bash
python3 scripts/daily_brief.py \
  --package xhs-captures/xhs-watch-package-2026-07-06.json \
  --language 中文 \
  --detail 普通
```

## Safety Boundary

This skill reads only pages the user can view in a visible browser session. It must not ask for passwords, SMS codes, cookies, or session tokens, and it must not bypass CAPTCHA, risk checks, rate limits, or private APIs.

## Desktop App

A first desktop wrapper lives in `desktop-app/`.

```bash
cd desktop-app
npm install
npm run install-browsers
npm start
```

This app is intended for users who do not use Codex. It provides a local UI for creator watchlist entry, language/detail selection, visible-browser collection, logs, and Markdown report preview.
