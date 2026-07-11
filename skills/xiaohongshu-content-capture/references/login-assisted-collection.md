# Login-Assisted Collection

Use this workflow only for the packaged desktop application or CLI fallback. In Codex/GPT, use `codex-in-app-collection.md` and the in-app browser instead.

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
- add random homepage visits, decoy clicks, stealth patches, or human-simulation behavior intended to evade automation detection

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
  --video-playback-rate max \
  --video-frame-count 6
```

The script opens a browser and pauses for manual login. After login, it automatically searches for each watched creator and navigates only to a visible `/user/profile/...` candidate. It verifies the final profile URL and account signals before extraction. If verification fails, it skips extraction and writes a debug screenshot/text record instead of reading the search page as a profile.

For each target-date post, the collector verifies the note detail URL. Text/image posts are expanded and reread until stable. Video posts use the highest playback rate supported by the media element and pause at evenly spaced media timestamps for the same six-frame timeline coverage used at normal speed. Incomplete text reads, stalled videos, missing frame coverage, unverified detail pages, and videos that exceed `--max-video-seconds` are retained only as failure diagnostics and are excluded from report summaries, highlight details, and analysis.

Use `--no-manual-fallback` when you want the script to skip failed creators instead of pausing for intervention.

## Output

The script writes an internal collection package:

- `xhs-captures/xhs-watch-package-YYYY-MM-DD.json`
- video frame screenshots under `xhs-captures/frames/`

Then generate the brief:

```bash
python3 scripts/daily_brief.py \
  --package xhs-captures/xhs-watch-package-2026-07-06.json \
  --report-date 2026-07-06 \
  --language 中文 \
  --detail 普通
```

Language options: `zh`/`中文`, `en`/`英文`, `bilingual`/`双语`.

Detail options:

- `minimal`/`极简`: core findings only.
- `normal`/`普通`: summaries, analysis, metrics, and links.
- `detailed`/`详细`: full extraction notes, sampled frame paths, and overall analysis.

Do not create or present a CSV unless the user explicitly asks for it. Paste the Markdown report directly in the chat.

To calculate follower change, keep earlier follower snapshots in the collection package or provide a legacy follower export. If only today's snapshot exists, report the change as unknown.

The package records `collector_version`, `capture_policy_version`, per-creator navigation diagnostics, and per-post `analysis_ready`/`capture_status` fields. Treat these fields as the source of truth for whether a post is eligible for analysis.

## Background Mode

`--headless` can run ordinary navigation without a visible Chromium window after a valid login profile already exists, but it is best effort only. A fully unattended strict run is not guaranteed because login/CAPTCHA/risk prompts need the user and background/headless media may be throttled or behave differently. Do not mark a video analysis-ready unless end state and all required timeline frames are verified, regardless of headless status.
