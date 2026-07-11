import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path
from zoneinfo import ZoneInfo


MODULE_PATH = Path(__file__).parents[1] / "skills" / "xiaohongshu-content-capture" / "scripts" / "daily_brief.py"
SPEC = importlib.util.spec_from_file_location("daily_brief", MODULE_PATH)
daily_brief = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(daily_brief)


class DailyBriefTests(unittest.TestCase):
    def setUp(self):
        self.tz = ZoneInfo("Asia/Shanghai")

    def sample_post(self, **overrides):
        row = {
            "creator": "@测试博主",
            "published_at": "2026-07-10",
            "title": "测试视频",
            "body": "完整可见正文。第二句提供更多细节。",
            "likes": "1.2万",
            "collects": "2400",
            "comments": "88",
            "url": "https://www.xiaohongshu.com/explore/test-note",
            "analysis_ready": True,
            "media": {
                "video_count": 1,
                "playback_completed": True,
                "playback_rate": "16",
                "visible_caption_samples": ["第一段字幕", "第二段字幕"],
            },
            "video_frame_samples": [
                {"actual_seconds": 0},
                {"actual_seconds": 12.5},
                {"actual_seconds": 25},
                {"actual_seconds": 37.5},
            ],
        }
        row.update(overrides)
        return daily_brief.normalize_post(row, self.tz)

    def test_report_orders_summary_highlights_and_analysis(self):
        report = daily_brief.render_report(
            [self.sample_post()],
            [],
            ["@测试博主"],
            date(2026, 7, 11),
            self.tz,
            "bilingual",
            "detailed",
        )
        summary = report.index("内容概括 / Content summary")
        highlights = report.index("亮点细节 / Highlight details")
        analysis = report.index("内容分析 / Content analysis")
        self.assertLess(summary, highlights)
        self.assertLess(highlights, analysis)
        self.assertIn("16 倍速", report)
        self.assertIn("highest supported 16x rate", report)

    def test_normalization_tolerates_malformed_nested_fields(self):
        post = self.sample_post(media="bad", video_frame_samples="bad", warnings="bad")
        self.assertEqual(post["media"], {})
        self.assertEqual(post["video_frame_samples"], [])
        self.assertEqual(post["warnings"], [])
        daily_brief.highlight_details(post, "bilingual")

    def test_same_day_state_merges_posts_by_canonical_url(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            directory = Path(temp_dir)
            first = {
                "creators": ["@测试博主"],
                "posts": [{"creator": "@测试博主", "url": "https://example.test/note?token=old", "title": "旧标题"}],
                "followers": [],
            }
            second = {
                "creators": ["@测试博主"],
                "posts": [{"creator": "@测试博主", "url": "https://example.test/note?token=new", "title": "新标题", "likes": 10}],
                "followers": [],
            }
            daily_brief.merge_daily_state(directory, date(2026, 7, 11), first)
            merged, state_path = daily_brief.merge_daily_state(directory, date(2026, 7, 11), second)
            self.assertEqual(len(merged["posts"]), 1)
            self.assertEqual(merged["posts"][0]["title"], "新标题")
            self.assertEqual(merged["posts"][0]["likes"], 10)
            self.assertTrue(state_path.exists())
            json.loads(state_path.read_text(encoding="utf-8"))

    def test_cli_writes_one_merged_report_and_history_entry_per_day(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            archive = root / "daily-reports"
            creators = root / "creators.txt"
            creators.write_text("@测试博主\n", encoding="utf-8")

            def run_package(filename, title, token):
                package_path = root / filename
                package_path.write_text(json.dumps({
                    "report_date": "2026-07-11",
                    "creators": ["@测试博主"],
                    "posts": [{
                        "creator": "@测试博主",
                        "published_at": "2026-07-10",
                        "title": title,
                        "detail_text": "完整正文",
                        "url": f"https://example.test/note?token={token}",
                        "analysis_ready": True,
                        "media": {"video_count": 0},
                    }],
                    "followers": [],
                }, ensure_ascii=False), encoding="utf-8")
                return subprocess.run([
                    sys.executable,
                    str(MODULE_PATH),
                    "--package", str(package_path),
                    "--creators-file", str(creators),
                    "--report-date", "2026-07-11",
                    "--language", "双语",
                    "--detail", "详细",
                    "--archive-dir", str(archive),
                    "--no-stdout",
                ], capture_output=True, text=True, check=False)

            first = run_package("first.json", "初次标题", "old")
            second = run_package("second.json", "更新标题", "new")
            self.assertEqual(first.returncode, 0, first.stderr)
            self.assertEqual(second.returncode, 0, second.stderr)
            report = (archive / "2026-07-11.md").read_text(encoding="utf-8")
            history = (archive / "index.md").read_text(encoding="utf-8")
            self.assertIn("更新标题", report)
            self.assertNotIn("初次标题", report)
            self.assertEqual(history.count("| report_date: 2026-07-11 "), 1)
            self.assertNotIn("# 小红书", second.stdout)


if __name__ == "__main__":
    unittest.main()
