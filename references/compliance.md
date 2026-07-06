# Compliance Boundaries

Use this reference when the user asks how to collect Xiaohongshu creator data.

## Allowed Sources

- CSV/JSON/JSONL files the user provides
- manually captured public post fields
- the user's own authorized analytics exports
- compliant third-party monitoring exports
- internal spreadsheets maintained by the user

## Do Not Build

- login automation bypass
- CAPTCHA or device-check bypass
- private API reverse engineering
- session-cookie reuse
- rate-limit evasion
- scraping private, deleted, access-restricted, or paywalled content

## Practical Collection Pattern

Ask the user to maintain daily exports with:

- creator account
- follower snapshot
- post date
- post title
- post body or short summary
- likes, collects, comments
- original link

Then run `scripts/daily_brief.py` to generate the brief.
