# Data Schema

Use this reference when preparing Xiaohongshu content-capture data for `scripts/daily_brief.py`.

## Posts File

Accepted formats: `.csv`, `.json`, `.jsonl`.

Recommended fields:

| Field | Accepted aliases |
| --- | --- |
| `creator` | `author`, `account`, `account_name`, `账号名`, `博主`, `作者` |
| `published_at` | `date`, `time`, `created_at`, `发布时间`, `发布日期` |
| `title` | `标题`, `note_title`, `name` |
| `body` | `content`, `desc`, `description`, `正文`, `内容`, `简介`, `summary` |
| `likes` | `点赞`, `赞`, `like_count`, `liked_count` |
| `collects` | `收藏`, `favorites`, `fav_count`, `collect_count` |
| `comments` | `评论`, `comment_count` |
| `url` | `链接`, `原文链接`, `link`, `note_url` |
| `follower_count` | `粉丝数`, `followers`, `fans`, `fans_count` |
| `previous_follower_count` | `昨日粉丝数`, `prev_followers`, `previous_followers` |

## Followers File

Accepted formats: `.csv`, `.json`, `.jsonl`.

Recommended fields:

| Field | Accepted aliases |
| --- | --- |
| `creator` | `author`, `account`, `account_name`, `账号名`, `博主`, `作者` |
| `snapshot_date` | `date`, `time`, `created_at`, `统计日期`, `日期` |
| `follower_count` | `粉丝数`, `followers`, `fans`, `fans_count` |

## Count Formats

The script normalizes common Chinese count formats:

- `1.2万` -> `12000`
- `3k` -> `3000`
- `2,345` -> `2345`
- empty -> `0`

## Creator Name Matching

Creator names are normalized by trimming whitespace and allowing optional leading `@`.

`creatorA` and `@creatorA` match the same watchlist entry.
