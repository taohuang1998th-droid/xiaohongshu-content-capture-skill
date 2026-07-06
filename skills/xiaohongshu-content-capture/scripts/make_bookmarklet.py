#!/usr/bin/env python3
import argparse
import re
from pathlib import Path
from urllib.parse import quote


def strip_comments(source):
    source = re.sub(r"/\*.*?\*/", "", source, flags=re.S)
    source = re.sub(r"^\s*//.*$", "", source, flags=re.M)
    return source


def main():
    skill_dir = Path(__file__).resolve().parents[1]
    default_input = skill_dir / "helpers" / "visible_page_collector.js"
    parser = argparse.ArgumentParser(description="Create a bookmarklet URL for the visible page collector.")
    parser.add_argument("--input", type=Path, default=default_input)
    parser.add_argument("--out", type=Path, help="Optional output .txt path. Defaults to stdout.")
    args = parser.parse_args()

    source = strip_comments(args.input.read_text(encoding="utf-8"))
    compact = re.sub(r"\s+", " ", source).strip()
    bookmarklet = "javascript:" + quote(compact, safe="()[]{};,.=:+-*/%!?<>|&'\"`~@#$")
    if args.out:
        args.out.write_text(bookmarklet + "\n", encoding="utf-8")
    else:
        print(bookmarklet)


if __name__ == "__main__":
    main()
