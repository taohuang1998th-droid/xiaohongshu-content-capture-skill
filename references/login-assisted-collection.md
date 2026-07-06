# Login-Assisted Collection

Use this workflow when the user authorizes Codex to operate inside a browser session that the user logs into manually.

## Boundary

Allowed:

- open a visible browser window
- let the user log in directly on Xiaohongshu
- automatically search for each watched creator
- click the best matching visible creator/profile result
- read visible DOM content after the page opens
- open likely yesterday post detail pages
- play visible video elements in the logged-in browser and sample screenshots
- export an internal JSON collection package
- generate a Markdown brief and show it directly in chat

Not allowed:

- ask for account password, SMS code, cookies, or session tokens
- bypass CAPTCHA, device verification, risk checks, or rate limits
- call private APIs or reverse-engineer app/web endpoints
- run high-volume crawling or automated scrolling loops

The browser profile is stored in `--profile-dir` so the user's own login can persist between runs. Tell the user where the profile is and that they can delete it to remove the saved browser session.

Video caveat: the script can play visible videos and capture frames. It does not transcribe audio unless captions or audio text are visible in the page. When summarizing video posts, base the analysis on visible detail text, captions, comments/counts visible on the page, and sampled frames. State limitations clearly when audio is not available.

## First-Run Watchlist

This skill ships with no default creators. If `config/creators.txt` is empty, `collect_with_login.js` prompts the user to paste creator handles and saves them. Users can also configure the list ahead of time:

```bash
python3 scripts/update_creators.py --init
python3 scripts/update_creators.py --set @creatorA @creatorB
```

## Command

Run with bundled Node and Playwright:

```bash
NODE_PATH=/Users/taohuang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules \
/Users/taohuang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
scripts/collect_with_login.js \
  --report-date 2026-07-06 \
  --out-dir xhs-captures \
  --profile-dir work/xhs-browser-profile \
  --detail-limit 6 \
  --play-seconds 12
```

The script opens a browser and pauses for manual login. For each creator, it opens Xiaohongshu search and asks the user to open the correct creator/profile/post page before pressing Enter in the terminal.
After login, the script automatically searches and opens each watched creator. It should only pause if it cannot find a confident match or if Xiaohongshu shows a verification/risk page.

Use `--no-manual-fallback` when you want the script to skip failed creators instead of pausing for intervention.

## Output

The script writes an internal collection package:

- `xhs-captures/xhs-watch-package-YYYY-MM-DD.json`
- video frame screenshots under `xhs-captures/frames/`

Then generate the brief:

```bash
python3 scripts/daily_brief.py \
  --package xhs-captures/xhs-watch-package-2026-07-06.json \
  --report-date 2026-07-06
```

Do not create or present a CSV unless the user explicitly asks for it. Paste the Markdown report directly in the chat.

To calculate follower change, keep earlier follower snapshots in the collection package or provide a legacy follower export. If only today's snapshot exists, report the change as unknown.
