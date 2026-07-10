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


def unique_report_path(directory, report_day, language, detail):
    directory.mkdir(parents=True, exist_ok=True)
    stem = f"{report_day.isoformat()}-{language}-{detail}"
    candidate = directory / f"{stem}.md"
    index = 2
    while candidate.exists():
        candidate = directory / f"{stem}-{index}.md"
        index += 1
    return candidate


def append_history_index(directory, report_path, report_day, covered_day, language, detail, creators, package_path=None):
    index_path = directory / "index.md"
    rel_report = report_path.name
    creator_text = ", ".join(creators)
    package_text = f" | package: `{package_path}`" if package_path else ""
    entry = (
        f"- {datetime.now(ZoneInfo('Asia/Shanghai')).strftime('%Y-%m-%d %H:%M:%S')} "
        f"| report: [{rel_report}]({rel_report}) "
        f"| report_date: {report_day.isoformat()} "
        f"| covered_date: {covered_day.isoformat()} "
        f"| language: {language} "
        f"| detail: {detail} "
        f"| creators: {creator_text}{package_text}\n"
    )
    if not index_path.exists():
        index_path.write_text("# Xiaohongshu Brief History\n\n", encoding="utf-8")
    with index_path.open("a", encoding="utf-8") as f:
        f.write(entry)
    return index_path


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
    record["metric_source"] = str(row.get("metric_source", "")).strip() if isinstance(row, dict) else ""
    record["warnings"] = row.get("warnings", []) if isinstance(row, dict) and isinstance(row.get("warnings"), list) else []
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


LABELS = {
    "zh": {
        "title": "小红书内容抓取简报",
        "report_date": "报告日期",
        "covered_date": "覆盖发布日期",
        "watched": "关注博主",
        "posts_loaded": "载入帖子数",
        "followers_loaded": "粉丝快照数",
        "caveat": "数据说明：本报告基于用户授权/手动提供的可见页面或导出数据生成。",
        "follower_count": "粉丝数",
        "delta": "较前日变化",
        "posts_found": "昨日帖子数",
        "no_posts": "输入数据中未发现该博主昨日发布的帖子。",
        "summary": "内容概括",
        "analysis": "内容分析",
        "likes": "点赞",
        "collects": "收藏",
        "comments": "评论",
        "link": "原文链接",
        "extraction": "采集说明",
        "frames": "视频/图片抽帧",
        "metric_source": "互动指标来源",
        "warnings": "采集警告",
        "overall": "整体分析",
        "detailed_posts": "已分析详情帖子数",
        "videos": "检测到可播放视频的帖子数",
        "pattern": "模式：优先选择能让读者立刻理解“这和我有什么关系”的选题钩子。",
        "watch": "注意：如果页面只暴露卡片级数据，互动指标应视为方向性参考，直到详情页计数可见。",
        "no_body": "输入中没有可用于概括的正文或详情文本。",
        "original_text": "原始可见文本",
        "detail_only": "仅采集到详情文本。",
    },
    "en": {
        "title": "Xiaohongshu Content Capture Brief",
        "report_date": "Report date",
        "covered_date": "Covered publishing date",
        "watched": "Watched creators",
        "posts_loaded": "Posts loaded",
        "followers_loaded": "Follower snapshots loaded",
        "caveat": "Data caveat: this report is generated from authorized visible pages or user-provided exports.",
        "follower_count": "Follower count",
        "delta": "Change vs previous day",
        "posts_found": "Yesterday posts found",
        "no_posts": "No yesterday posts from this creator were present in the input data.",
        "summary": "Content summary",
        "analysis": "Content analysis",
        "likes": "Likes",
        "collects": "Collects",
        "comments": "Comments",
        "link": "Original link",
        "extraction": "Extraction note",
        "frames": "Sampled video/image frames",
        "metric_source": "Engagement metric source",
        "warnings": "Collection warnings",
        "overall": "Overall Analysis",
        "detailed_posts": "Detailed posts analyzed",
        "videos": "Posts with playable video detected",
        "pattern": "Pattern: prioritize hooks that quickly show why the topic matters to the reader.",
        "watch": "Watch point: if only card-level data is visible, treat engagement metrics as directional until detail-page counters are visible.",
        "no_body": "No body or detail text was available for summarization.",
        "original_text": "Original visible text",
        "detail_only": "Detail text only.",
    },
}


def label(key, language):
    if language == "bilingual":
        zh = LABELS["zh"][key]
        en = LABELS["en"][key]
        return f"{zh} / {en}"
    return LABELS[language][key]


def normalize_language(value):
    text = str(value or "zh").strip().lower()
    aliases = {
        "zh": "zh",
        "cn": "zh",
        "chinese": "zh",
        "中文": "zh",
        "汉语": "zh",
        "en": "en",
        "english": "en",
        "英文": "en",
        "英语": "en",
        "bilingual": "bilingual",
        "bi": "bilingual",
        "dual": "bilingual",
        "双语": "bilingual",
        "中英": "bilingual",
        "中英双语": "bilingual",
    }
    if text not in aliases:
        raise SystemExit("Unsupported --language. Use zh/en/bilingual or 中文/英文/双语.")
    return aliases[text]


def normalize_detail(value):
    text = str(value or "normal").strip().lower()
    aliases = {
        "minimal": "minimal",
        "mini": "minimal",
        "short": "minimal",
        "brief": "minimal",
        "极简": "minimal",
        "极简版": "minimal",
        "normal": "normal",
        "standard": "normal",
        "普通": "normal",
        "普通版": "normal",
        "detailed": "detailed",
        "detail": "detailed",
        "full": "detailed",
        "long": "detailed",
        "详细": "detailed",
        "详细版": "detailed",
    }
    if text not in aliases:
        raise SystemExit("Unsupported --detail. Use minimal/normal/detailed or 极简/普通/详细.")
    return aliases[text]


def metric_score(post):
    return sum(post[field] or 0 for field in ("likes", "collects", "comments"))


def summarize(text, limit=180):
    clean = re.sub(r"\s+", " ", str(text or "")).strip()
    if not clean:
        return ""
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


def strip_noise(text):
    clean = re.sub(r"\s+", " ", str(text or "")).strip()
    clean = re.sub(r"#\S+", "", clean)
    clean = re.sub(r"@\S+", "", clean)
    clean = re.sub(r"(赞|收藏|评论|回复|展开|收起)\s*\d+(?:\.\d+)?[万wkWK]?", "", clean)
    clean = re.sub(r"(昨天|今天|\d+小时前|\d+分钟前)\s*\d{1,2}:\d{2}?", "", clean)
    clean = re.sub(r"\s+", " ", clean).strip(" ，。|｜:-")
    return clean


def extract_hashtags(text):
    return [tag.strip("#") for tag in re.findall(r"#([\w\u4e00-\u9fff-]+)", str(text or "")) if tag.strip("#")]


def video_summary_zh(post, limit):
    title = (post.get("title") or "").replace(" - 小红书", "").strip()
    text = content_source(post)
    cleaned = strip_noise(text)
    tags = extract_hashtags(text)
    media = post.get("media") or {}
    playback = "已在可见浏览器中完整播放并抽取画面" if media.get("playback_completed") else "已在可见浏览器中尝试播放并抽取画面，但系统未能确认播放到结尾"
    sentence = ""
    sentences = chinese_sentences(cleaned)
    if sentences:
        sentence = " ".join(sentences[:2])
    elif cleaned and cleaned != title:
        sentence = cleaned

    if sentence:
        summary = f"这条视频围绕“{title or '该主题'}”展开，{playback}。页面可见正文显示：{sentence}"
    elif tags:
        summary = f"这条视频围绕“{title or '该主题'}”展开，{playback}。可见信息主要指向{ '、'.join(tags[:5]) }等主题；由于页面没有暴露完整字幕或口播文本，内容总结主要依据标题、可见标签和播放过程中的抽帧画面。"
    else:
        summary = f"这条视频围绕“{title or '该主题'}”展开，{playback}；由于页面没有暴露完整字幕或口播文本，内容总结主要依据标题和播放过程中的抽帧画面。"
    return summarize(summary, limit)


def video_summary_en(post, limit):
    title = (post.get("title") or "").replace(" - 小红书", "").strip()
    text = content_source(post)
    cleaned = strip_noise(text)
    tags = extract_hashtags(text)
    media = post.get("media") or {}
    playback = "was played through in the visible browser and sampled with frames" if media.get("playback_completed") else "was played and sampled in the visible browser, but completion could not be confirmed"
    sentence = ""
    sentences = chinese_sentences(cleaned)
    if sentences:
        sentence = " ".join(sentences[:2])
    elif cleaned and cleaned != title:
        sentence = cleaned

    if sentence:
        summary = f'This video centers on "{title or "the visible topic"}" and {playback}. The visible page text indicates: {sentence}'
    elif tags:
        summary = f'This video centers on "{title or "the visible topic"}" and {playback}. The visible metadata points to themes such as {", ".join(tags[:5])}. Because full subtitles or speech transcript were not exposed on the page, the summary is based on the title, visible tags, and screenshots sampled during playback.'
    else:
        summary = f'This video centers on "{title or "the visible topic"}" and {playback}. Because full subtitles or speech transcript were not exposed on the page, the summary is based on the title and screenshots sampled during playback.'
    return summarize(summary, limit)


def summarize_content(post, language="zh", detail="normal"):
    text = content_source(post)
    limit = {"minimal": 120, "normal": 260, "detailed": 420}[detail]
    if post.get("media", {}).get("video_count"):
        zh = video_summary_zh(post, limit)
        en = video_summary_en(post, limit)
        if language == "en":
            return en
        if language == "bilingual":
            return f"{zh}\n  - EN: {en}"
        return zh
    sentences = chinese_sentences(text)
    if sentences:
        summary = " ".join(sentences[:3])
        summary = summarize(summary, limit)
    else:
        summary = summarize(text, limit)
    if not summary:
        return label("no_body", "en" if language == "en" else "zh")
    if language == "en":
        return f"{LABELS['en']['original_text']}: {summary}"
    if language == "bilingual":
        return f"{summary}\n  - EN: Original visible text retained as source material because no separate translation engine is available in the offline report script."
    return summary


def analyze_post_zh(post):
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


def analyze_post_en(post):
    text = content_source(post)
    title = post.get("title") or ""
    observations = []
    if re.search(r"AI|Anthropic|模型|估值|科技|创业|效率", f"{title} {text}", re.I):
        observations.append("This is a knowledge/trend explainer; the hook connects a hot event to practical relevance for ordinary readers.")
    if re.search(r"小猫|跳|可爱|日常|情绪|生活|女性", f"{title} {text}"):
        observations.append("The post leans on light emotion and visual memorability; the title is concrete and easy to react to.")
    if re.search(r"成功|女人|背后|职场|成长|关系", f"{title} {text}"):
        observations.append("The topic uses identity and value framing, which can invite recognition, debate, and comment-driven interaction.")
    if post.get("media", {}).get("video_count"):
        observations.append("A playable video was detected; analysis is based on visible page text and sampled frames, not audio transcription unless captions are visible.")
    if not observations:
        observations.append("Assess the post through hook clarity, information density, visual evidence, and comment incentives.")
    return " ".join(observations)


def analyze_post(post, language="zh"):
    if language == "en":
        return analyze_post_en(post)
    if language == "bilingual":
        return f"{analyze_post_zh(post)}\n  - EN: {analyze_post_en(post)}"
    return analyze_post_zh(post)


def render_doc_analysis(posts, creators, language):
    all_posts = [post for post in posts if post["creator"] in creators]
    with_posts = [post for post in all_posts if post.get("title") or post.get("body") or post.get("detail_text")]
    video_count = sum(1 for post in all_posts if post.get("media", {}).get("video_count"))
    lines = [
        f"## {label('overall', language)}",
        "",
        f"- {label('detailed_posts', language)}: {len(with_posts)}",
        f"- {label('videos', language)}: {video_count}",
        f"- {label('pattern', language)}",
        f"- {label('watch', language)}",
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


def render_report(posts, followers, creators, report_day, tz, language="zh", detail="normal"):
    target_day = report_day - timedelta(days=1)
    prior_snapshot_day = report_day - timedelta(days=1)
    lookup = follower_lookup(posts, followers)
    posts_by_creator = defaultdict(list)
    for post in posts:
        if post["creator"] in creators and post["published_at"] and post["published_at"].date() == target_day:
            posts_by_creator[post["creator"]].append(post)

    lines = [
        f"# {label('title', language)}",
        "",
        f"- {label('report_date', language)}: {report_day.isoformat()} ({tz.key})",
        f"- {label('covered_date', language)}: {target_day.isoformat()}",
        f"- {label('watched', language)}: {', '.join(creators)}",
    ]
    if detail != "minimal":
        lines += [
            f"- {label('posts_loaded', language)}: {len(posts)}",
            f"- {label('followers_loaded', language)}: {len(followers)}",
            f"- {label('caveat', language)}",
        ]
    lines += [""]

    for creator in creators:
        current = latest_count_for(creator, report_day, lookup) or latest_count_for(creator, target_day, lookup)
        previous = latest_count_for(creator, prior_snapshot_day, lookup)
        delta = current - previous if current and previous else None
        creator_posts = sorted(posts_by_creator.get(creator, []), key=metric_score, reverse=True)

        lines += [
            f"## {creator}",
            "",
            f"- {label('follower_count', language)}: {fmt_count(current) if current else 'unknown'}",
            f"- {label('delta', language)}: {fmt_delta(delta)}",
            f"- {label('posts_found', language)}: {len(creator_posts)}",
            "",
        ]

        if not creator_posts:
            lines += [label("no_posts", language), ""]
            continue

        for idx, post in enumerate(creator_posts, 1):
            frame_lines = []
            if detail == "detailed" and post.get("video_frame_paths"):
                frame_lines = [f"- {label('frames', language)}:", *[f"  - {path}" for path in post["video_frame_paths"][:3]]]
            lines += [
                f"### {idx}. {(post['title'] or '(untitled)').replace(' - 小红书', '')}",
                "",
            ]
            if detail == "minimal":
                lines += [
                    f"- {label('summary', language)}: {summarize_content(post, language, detail)}",
                    f"- {label('link', language)}: {post['url'] or 'No URL provided'}",
                    "",
                ]
                continue

            lines += [
                f"- {label('summary', language)}: {summarize_content(post, language, detail)}",
                f"- {label('analysis', language)}: {analyze_post(post, language)}",
                f"- {label('likes', language)}: {fmt_count(post['likes'])}",
                f"- {label('collects', language)}: {fmt_count(post['collects'])}",
                f"- {label('comments', language)}: {fmt_count(post['comments'])}",
                f"- {label('link', language)}: {post['url'] or 'No URL provided'}",
            ]
            if detail == "detailed":
                warning_lines = []
                if post.get("warnings"):
                    warning_lines = [f"- {label('warnings', language)}:", *[f"  - {item}" for item in post["warnings"]]]
                lines += [
                    f"- {label('extraction', language)}: {post.get('extraction_note') or label('detail_only', language)}",
                    f"- {label('metric_source', language)}: {post.get('metric_source') or 'unknown'}",
                    *warning_lines,
                    *frame_lines,
                ]
            lines += [""]

    if detail != "minimal":
        lines += render_doc_analysis(posts, creators, language)
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
    parser.add_argument("--language", default="zh", help="Brief language: zh/en/bilingual, or 中文/英文/双语. Default: zh.")
    parser.add_argument("--detail", default="normal", help="Brief detail level: minimal/normal/detailed, or 极简/普通/详细. Default: normal.")
    parser.add_argument("--out", type=Path, help="Markdown output path. Defaults to stdout.")
    parser.add_argument("--archive-dir", type=Path, help="Directory for non-overwriting dated report history. Also updates index.md.")
    parser.add_argument("--no-stdout", action="store_true", help="Do not print the full report to terminal; print only saved paths.")
    args = parser.parse_args()
    args.language = normalize_language(args.language)
    args.detail = normalize_detail(args.detail)

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

    covered_day = report_day - timedelta(days=1)
    report = render_report(posts, followers, creators, report_day, tz, args.language, args.detail)
    saved_paths = []
    if args.out:
        args.out.write_text(report, encoding="utf-8")
        saved_paths.append(args.out)
    if args.archive_dir:
        archived = unique_report_path(args.archive_dir, report_day, args.language, args.detail)
        archived.write_text(report, encoding="utf-8")
        index_path = append_history_index(
            args.archive_dir,
            archived,
            report_day,
            covered_day,
            args.language,
            args.detail,
            creators,
            args.package,
        )
        saved_paths.extend([archived, index_path])

    if not args.no_stdout:
        print(report)
    elif saved_paths:
        print("Saved report artifacts:")
        for path in saved_paths:
            print(path)


if __name__ == "__main__":
    main()
