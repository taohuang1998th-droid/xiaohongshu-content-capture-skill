#!/usr/bin/env python3
import argparse
import csv
import json
import re
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo


POST_ALIASES = {
    "creator": ["creator", "author", "account", "account_name", "账号名", "博主", "作者"],
    "published_at": ["published_at", "date", "time", "created_at", "发布时间", "发布日期"],
    "title": ["title", "标题", "note_title", "name"],
    "body": ["body", "content", "desc", "description", "正文", "内容", "简介", "summary"],
    "likes": ["likes", "点赞", "赞", "like_count", "liked_count"],
    "collects": ["collects", "收藏", "favorites", "fav_count", "collect_count"],
    "comments": ["comments", "评论", "comment_count"],
    "url": ["url", "链接", "原文链接", "link", "note_url"],
    "follower_count": ["follower_count", "粉丝数", "followers", "fans", "fans_count"],
    "previous_follower_count": ["previous_follower_count", "昨日粉丝数", "prev_followers", "previous_followers"],
    "detail_text": ["detail_text", "visible_text", "详情页文本", "detail"],
    "extraction_note": ["extraction_note", "采集备注", "note"],
}

FOLLOWER_ALIASES = {
    "creator": ["creator", "author", "account", "account_name", "账号名", "博主", "作者"],
    "snapshot_date": ["snapshot_date", "date", "time", "created_at", "统计日期", "日期"],
    "follower_count": ["follower_count", "粉丝数", "followers", "fans", "fans_count"],
}


def first_value(row, aliases):
    for key in aliases:
        if key in row and row[key] not in (None, ""):
            return row[key]
    lowered = {str(k).strip().lower(): v for k, v in row.items()}
    for key in aliases:
        value = lowered.get(str(key).strip().lower())
        if value not in (None, ""):
            return value
    return ""


def normalize_creator(value):
    text = re.sub(r"\s+", "", str(value or "").strip())
    return text if text.startswith("@") else f"@{text}" if text else ""


def parse_count(value, unknown_as_none=False):
    if value is None:
        return None if unknown_as_none else 0
    if isinstance(value, (int, float)):
        return int(value)
    text = str(value).strip().lower().replace(",", "")
    if not text or text in {"-", "unknown", "nan", "none"}:
        return None if unknown_as_none else 0
    multiplier = 1
    if text.endswith(("万", "w")):
        multiplier = 10000
        text = text[:-1]
    elif text.endswith("k"):
        multiplier = 1000
        text = text[:-1]
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return None if unknown_as_none else 0
    return int(float(match.group(0)) * multiplier)


def parse_dt(value, tz):
    if not value:
        return None
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S"):
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=tz)
        except ValueError:
            pass
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=tz)
        return parsed.astimezone(tz)
    except ValueError:
        return None


def load_rows(path):
    suffix = path.suffix.lower()
    if suffix == ".csv":
        with path.open("r", encoding="utf-8-sig", newline="") as f:
            return list(csv.DictReader(f))
    if suffix == ".jsonl":
        with path.open("r", encoding="utf-8") as f:
            return [json.loads(line) for line in f if line.strip()]
    if suffix == ".json":
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return data
        for key in ("items", "posts", "notes", "data", "records"):
            if isinstance(data.get(key), list):
                return data[key]
    raise ValueError(f"Unsupported or unrecognized file format: {path}")


def load_package(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    posts = data.get("posts", [])
    followers = data.get("followers", [])
    return posts, followers, data


def read_creators(path):
    if not path.exists():
        return []
    return [
        normalize_creator(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]


def creators_from_posts(posts, followers):
    ordered = []
    for row in list(posts) + list(followers):
        creator = normalize_creator(row.get("creator", "") if isinstance(row, dict) else "")
        if creator and creator not in ordered:
            ordered.append(creator)
    return ordered


def normalize_post(row, tz):
    record = {field: first_value(row, aliases) for field, aliases in POST_ALIASES.items()}
    record["creator"] = normalize_creator(record["creator"])
    record["published_at_raw"] = record["published_at"]
    record["published_at"] = parse_dt(record["published_at"], tz)
    record["title"] = str(record["title"]).strip()
    record["body"] = str(record["body"]).strip()
    record["url"] = str(record["url"]).strip()
    record["detail_text"] = str(record["detail_text"]).strip()
    record["extraction_note"] = str(record["extraction_note"]).strip()
    record["video_frame_paths"] = row.get("video_frame_paths", []) if isinstance(row, dict) else []
    record["media"] = row.get("media", {}) if isinstance(row, dict) else {}
    for field in ("likes", "collects", "comments"):
        record[field] = parse_count(record[field], unknown_as_none=True)
    for field in ("follower_count", "previous_follower_count"):
        record[field] = parse_count(record[field])
    return record


def normalize_follower(row, tz):
    record = {field: first_value(row, aliases) for field, aliases in FOLLOWER_ALIASES.items()}
    record["creator"] = normalize_creator(record["creator"])
    record["snapshot_date_raw"] = record["snapshot_date"]
    record["snapshot_date"] = parse_dt(record["snapshot_date"], tz)
    record["follower_count"] = parse_count(record["follower_count"])
    return record


def fmt_count(value):
    if value is None:
        return "unknown"
    sign = ""
    if value < 0:
        sign = "-"
        value = abs(value)
    if value >= 10000:
        return f"{sign}{value / 10000:.1f}万"
    return f"{sign}{value}"


def fmt_delta(value):
    if value is None:
        return "unknown"
    if value > 0:
        return f"+{fmt_count(value)}"
    if value < 0:
        return fmt_count(value)
    return "0"


def metric_score(post):
    return sum(post[field] or 0 for field in ("likes", "collects", "comments"))


def summarize(text, limit=180):
    clean = re.sub(r"\s+", " ", str(text or "")).strip()
    if not clean:
        return "No content summary/body was available in the input."
    return clean if len(clean) <= limit else clean[: limit - 1] + "..."


def content_source(post):
    detail = post.get("detail_text") or ""
    body = post.get("body") or ""
    boilerplate_markers = ("沪ICP备", "营业执照", "公网安备", "增值电信业务经营许可证")
    if body and any(marker in detail for marker in boilerplate_markers):
        return body
    return detail or body or post.get("title") or ""


def chinese_sentences(text):
    clean = re.sub(r"\s+", " ", str(text or "")).strip()
    parts = re.split(r"(?<=[。！？!?])\s*", clean)
    return [part.strip() for part in parts if len(part.strip()) >= 8]


def summarize_content(post):
    text = content_source(post)
    sentences = chinese_sentences(text)
    if sentences:
        summary = " ".join(sentences[:3])
        return summarize(summary, 260)
    return summarize(text, 260)


def analyze_post(post):
    text = content_source(post)
    title = post.get("title") or ""
    observations = []
    if re.search(r"AI|Anthropic|模型|估值|科技|创业|效率", f"{title} {text}", re.I):
        observations.append("选题偏知识/趋势解释，适合用“热点事件 + 普通人关系”的角度承接流量。")
    if re.search(r"小猫|跳|可爱|日常|情绪|生活|女性", f"{title} {text}"):
        observations.append("表达偏轻情绪和视觉记忆点，标题具备画面感，适合短平快传播。")
    if re.search(r"成功|女人|背后|职场|成长|关系", f"{title} {text}"):
        observations.append("选题带有价值判断和人群身份标签，容易引发认同、补充和争议型互动。")
    if post.get("media", {}).get("video_count"):
        observations.append("该笔记包含可播放视频，分析主要基于详情页文字和抽帧画面；如无字幕，音频信息不会被自动转写。")
    if not observations:
        observations.append("该内容可从标题、正文、封面/视频帧、互动数据四个维度进一步判断：钩子是否清晰、信息密度是否足够、评论诱因是否明显。")
    return " ".join(observations)


def render_doc_analysis(posts, creators):
    all_posts = [post for post in posts if post["creator"] in creators]
    with_posts = [post for post in all_posts if post.get("title") or post.get("body") or post.get("detail_text")]
    video_count = sum(1 for post in all_posts if post.get("media", {}).get("video_count"))
    lines = [
        "## Overall Analysis",
        "",
        f"- Detailed posts analyzed: {len(with_posts)}",
        f"- Posts with playable video detected: {video_count}",
        "- Pattern: prioritize hooks that make the reader immediately know why the topic matters to them.",
        "- Watch point: if a post only exposes card-level data, treat metrics as directional instead of exact until detail-page counters are visible.",
        "",
    ]
    return lines


def follower_lookup(posts, followers):
    by_creator_date = defaultdict(dict)
    for item in followers:
        if item["creator"] and item["snapshot_date"]:
            by_creator_date[item["creator"]][item["snapshot_date"].date()] = item["follower_count"]
    for post in posts:
        if post["creator"] and post["published_at"] and post["follower_count"]:
            by_creator_date[post["creator"]][post["published_at"].date()] = post["follower_count"]
            prev = post["previous_follower_count"]
            if prev:
                by_creator_date[post["creator"]][post["published_at"].date() - timedelta(days=1)] = prev
    return by_creator_date


def latest_count_for(creator, target_day, lookup):
    snapshots = lookup.get(creator, {})
    if target_day in snapshots:
        return snapshots[target_day]
    earlier = [day for day in snapshots if day <= target_day]
    if not earlier:
        return 0
    return snapshots[max(earlier)]


def render_report(posts, followers, creators, report_day, tz):
    target_day = report_day - timedelta(days=1)
    prior_snapshot_day = report_day - timedelta(days=1)
    lookup = follower_lookup(posts, followers)
    posts_by_creator = defaultdict(list)
    for post in posts:
        if post["creator"] in creators and post["published_at"] and post["published_at"].date() == target_day:
            posts_by_creator[post["creator"]].append(post)

    lines = [
        "# Xiaohongshu Content Capture Brief",
        "",
        f"- Report date: {report_day.isoformat()} ({tz.key})",
        f"- Covered publishing date: {target_day.isoformat()}",
        f"- Watched creators: {', '.join(creators)}",
        f"- Posts loaded: {len(posts)}",
        f"- Follower snapshots loaded: {len(followers)}",
        "- Data caveat: this report reflects the authorized/manual export supplied to the skill.",
        "",
    ]

    for creator in creators:
        current = latest_count_for(creator, report_day, lookup) or latest_count_for(creator, target_day, lookup)
        previous = latest_count_for(creator, prior_snapshot_day, lookup)
        delta = current - previous if current and previous else None
        creator_posts = sorted(posts_by_creator.get(creator, []), key=metric_score, reverse=True)

        lines += [
            f"## {creator}",
            "",
            f"- Follower count: {fmt_count(current) if current else 'unknown'}",
            f"- Change vs previous day: {fmt_delta(delta)}",
            f"- Yesterday posts found: {len(creator_posts)}",
            "",
        ]

        if not creator_posts:
            lines += ["No yesterday posts from this creator were present in the input export.", ""]
            continue

        for idx, post in enumerate(creator_posts, 1):
            frame_lines = []
            if post.get("video_frame_paths"):
                frame_lines = ["- Video frames sampled:", *[f"  - {path}" for path in post["video_frame_paths"][:3]]]
            lines += [
                f"### {idx}. {(post['title'] or '(untitled)').replace(' - 小红书', '')}",
                "",
                f"- Content summary: {summarize_content(post)}",
                f"- Content analysis: {analyze_post(post)}",
                f"- Likes: {fmt_count(post['likes'])}",
                f"- Collects: {fmt_count(post['collects'])}",
                f"- Comments: {fmt_count(post['comments'])}",
                f"- Original link: {post['url'] or 'No URL provided'}",
                f"- Extraction note: {post.get('extraction_note') or 'Detail text only.'}",
                *frame_lines,
                "",
            ]

    lines += render_doc_analysis(posts, creators)
    return "\n".join(lines)


def main():
    skill_dir = Path(__file__).resolve().parents[1]
    default_creators = skill_dir / "config" / "creators.txt"

    parser = argparse.ArgumentParser(description="Generate a Markdown Xiaohongshu content-capture brief from an authorized collection package or exports.")
    parser.add_argument("--package", type=Path, help="Collection package generated by collect_with_login.js.")
    parser.add_argument("--posts", type=Path, help="Legacy posts export: .csv, .json, or .jsonl.")
    parser.add_argument("--followers", type=Path, help="Optional follower snapshots export.")
    parser.add_argument("--creators-file", type=Path, default=default_creators, help="Watchlist file, one creator per line.")
    parser.add_argument("--report-date", help="Report date in YYYY-MM-DD. Defaults to current date in Asia/Shanghai.")
    parser.add_argument("--out", type=Path, help="Markdown output path. Defaults to stdout.")
    args = parser.parse_args()

    tz = ZoneInfo("Asia/Shanghai")
    report_day = date.fromisoformat(args.report_date) if args.report_date else datetime.now(tz).date()
    creators = read_creators(args.creators_file)

    if args.package:
        raw_posts, raw_followers, package = load_package(args.package)
        if not args.report_date and package.get("report_date"):
            report_day = date.fromisoformat(package["report_date"])
        if not creators:
            creators = [normalize_creator(item) for item in package.get("creators", []) if normalize_creator(item)]
        if not creators:
            creators = creators_from_posts(raw_posts, raw_followers)
        posts = [normalize_post(row, tz) for row in raw_posts]
        followers = [normalize_follower(row, tz) for row in raw_followers]
    else:
        if not creators:
            raise SystemExit(f"No creators found in {args.creators_file}. Run scripts/update_creators.py --init first.")
        if not args.posts:
            raise SystemExit("Provide --package, or provide --posts for legacy exports.")
        posts = [normalize_post(row, tz) for row in load_rows(args.posts)]
        followers = [normalize_follower(row, tz) for row in load_rows(args.followers)] if args.followers else []

    report = render_report(posts, followers, creators, report_day, tz)
    if args.out:
        args.out.write_text(report, encoding="utf-8")
    else:
        print(report)


if __name__ == "__main__":
    main()
