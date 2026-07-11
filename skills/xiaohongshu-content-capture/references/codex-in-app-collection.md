# Codex In-App Xiaohongshu Collection

Use this workflow whenever the skill is invoked in Codex or GPT. It replaces terminal-launched Playwright for this surface.

## Authorization Boundary

The only account authorization required is the user's own login inside the visible Codex in-app browser. The user enters credentials and completes SMS, device verification, or CAPTCHA themselves.

Allowed after the user confirms login:

- navigate to public Xiaohongshu pages visible to the user's account
- use Xiaohongshu's visible search and profile links
- read bounded visible DOM content from creator and post pages
- click visible `展开全文`, player, and scrolling controls
- play visible videos from beginning to end
- capture screenshots and visible captions for the requested brief

Never request, inspect, export, or reuse passwords, SMS codes, cookies, local storage, or session tokens. Never bypass verification, risk controls, or rate limits.

Do not perform random homepage browsing, decoy clicks, artificial dwell loops, fingerprint changes, or other behavior intended to imitate a human or evade automation detection. Keep navigation bounded and task-directed. Use ordinary load-stability waits and stop for any verification or risk page.

## Browser Workflow

1. Use `browser:control-in-app-browser` and show the browser to the user.
2. Open one Xiaohongshu tab. If signed out, stop after opening the login page and ask the user to log in there.
3. Reuse the same tab after login; do not reselect a browser to work around authentication.
4. Use a focused user-search URL for each configured creator. Inspect a bounded DOM projection or current snapshot and accept only visible `/user/profile/...` candidates.
5. Navigate directly to the selected profile URL and verify the URL, account name, and profile signals before reading follower or post data.
6. Inspect only a bounded set of recent visible post links. Do not run broad scrolling or unbounded result loops.
7. Navigate directly to each post URL, verify the note ID, and read a scoped publishing-date element. Skip posts that are not verified as belonging to the covered date.

## Text Completeness

For a text/image post:

1. Identify the scoped note-content container from the current page state.
2. Locate visible `展开全文`, `展开`, or `查看更多` controls outside comments. Confirm the locator is unique before clicking.
3. Read the scoped content text, repeat after expansion/scrolling, and require two stable reads with no remaining expansion control.
4. Set `analysis_ready=true` only after this check. Otherwise retain the link and failure reason without summary or analysis.

## Video Completeness

For a video post:

1. Verify a single visible primary video and confirm its current time is at or near zero. Reload the verified detail URL when necessary to return to the beginning.
2. Inspect the visible player's speed menu and choose its highest offered rate. If the player exposes no speed control, keep 1x and record that limitation. Do not mutate media time or page state through read-only evaluation.
3. Before playback, calculate six evenly distributed target timestamps across the verified duration (or the configured frame count). Poll read-only media state, pause with visible controls at each target, capture the frame and visible captions, then resume at the same highest rate. This preserves normal-speed frame count and timeline coverage.
4. Continue until `ended=true` or current time reaches the verified duration. Record the actual playback rate, target timestamps, actual timestamps, and sampled-frame count.
5. Set `analysis_ready=true` only when playback from the beginning to the verified end is confirmed and the required frame samples were collected.
6. If playback stalls, verification appears, or completion/frame coverage cannot be confirmed, exclude the post from summary, highlight details, and analysis.

Visible playback does not provide audio transcription. Base the report on visible title/body/captions/on-screen text and sampled frames, and state this limitation when captions are absent.

## Background Limits

The in-app browser may be hidden for ordinary navigation and DOM reads only when that does not change page behavior. Do not claim a fully background run: login and verification require the visible browser, and hidden-tab media can be throttled or paused by the browser or operating system. Keep video playback and frame verification observable; restore visibility whenever progress or screenshots become unreliable.

## Output

Build a schema-version-3 collection package with:

- `collector_version: codex-iab-1.0.0`
- creator navigation diagnostics
- target-date evidence
- full-text completion fields
- video playback completion fields
- actual playback rate and timeline frame-sample metadata
- `analysis_ready` and failure reasons

Run `daily_brief.py` internally with `--archive-dir` and `--no-stdout`, then read the saved Markdown and paste it into the Codex/GPT conversation. Every analyzed post must render content summary, highlight details, and content analysis in that order. Never direct the user to a terminal for this workflow.
