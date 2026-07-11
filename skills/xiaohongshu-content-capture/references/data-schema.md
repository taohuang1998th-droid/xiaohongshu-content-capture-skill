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

Login-assisted collection packages also include:

| Field | Meaning |
| --- | --- |
| `analysis_ready` | `true` only when strict text/video completeness checks pass |
| `capture_status.content_type` | `text`, `video`, or `unknown` |
| `capture_status.detail_verification` | Verified detail-page URL status and reason |
| `capture_status.text_capture` | Full-text source, length, expansion count, stable reads, and completion status |
| `capture_status.video_playback_completed` | Whether the browser confirmed that video playback reached the end |
| `capture_status.video_frame_coverage_completed` | Whether all required timeline frame samples were saved |
| `capture_status.video_frame_count_required` | Required frame count for analysis readiness |
| `capture_status.video_frame_count_captured` | Successfully saved timeline frame count |
| `capture_status.failure_reason` | Machine-readable reason when analysis is blocked |
| `media.visible_caption_samples` | Visible subtitle/caption text sampled during full video playback |
| `media.playback_rate_requested` | Requested rate (`max` or an explicit numeric rate) |
| `media.playback_rate` | Actual highest rate accepted by the visible media element |
| `media.frame_sample_count` | Number of captured timeline frames |
| `media.frame_sample_targets_seconds` | Evenly distributed target timestamps across the media duration |
| `media.frame_sampling_missed_targets_seconds` | Target timestamps that were skipped or failed to save; any value here blocks strict frame coverage |
| `media.frame_sampling_strategy` | Sampling strategy; current strict value is `timeline-equidistant-paused-capture` |
| `video_frame_samples` | Frame paths plus target time, actual media time, and playback rate |

The report generator must not summarize, extract highlight details, or analyze a collected post when `analysis_ready` is explicitly `false`. Legacy user-provided exports without this field remain supported.

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
