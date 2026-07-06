# Visible Page Collection Helper

Use this helper when the user wants to manually collect data from Xiaohongshu pages they can already view in their own browser.

## Boundary

The helper:

- reads only the currently loaded page DOM
- exports visible text, links, images, and manually entered follower count
- does not call Xiaohongshu APIs
- does not automate login
- does not bypass CAPTCHA, rate limits, device checks, or anti-bot systems
- does not need the user's password, cookies, session token, or verification code

If the page requires login, the user should log in normally in their browser. Do not ask for credentials.

## Install As Bookmarklet

Generate a bookmarklet URL:

```bash
python3 scripts/make_bookmarklet.py --out xhs-collect-bookmarklet.txt
```

Then:

1. Open `xhs-collect-bookmarklet.txt`.
2. Copy the one-line `javascript:` URL.
3. Create a browser bookmark named `XHS Collect`.
4. Paste that one-line URL into the bookmark URL field.

For a simpler first test, open DevTools Console on the Xiaohongshu page, paste `helpers/visible_page_collector.js`, and press Enter.

## Use

1. Open a watched creator's Xiaohongshu page or a visible note/list page.
2. Make sure yesterday's posts are visible in the viewport.
3. Run the helper from the bookmark or console.
4. Fill or confirm:
   - creator account
   - post date
   - follower snapshot date
   - current visible follower count
5. Export:
   - visible posts CSV/JSON
   - follower snapshot CSV
6. Repeat for the previous-day follower snapshot if needed.
7. Combine exported CSV files manually or in a spreadsheet.
8. Run `scripts/daily_brief.py`.

## Expected Output Columns

Posts CSV:

```csv
published_at,creator,title,body,likes,collects,comments,url,cover_url,captured_at,page_url
```

Followers CSV:

```csv
snapshot_date,creator,follower_count,captured_at,page_url
```

## Caveats

This is a visible-page assistant, not a reliable site crawler. Because Xiaohongshu page markup can change and many values may render dynamically:

- always manually verify exported rows
- scroll and export again if posts are not visible
- fill missing engagement counts manually if the visible page omits them
- use exports as inputs to the skill, not as proof of complete account history
