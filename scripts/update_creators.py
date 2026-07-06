#!/usr/bin/env python3
import argparse
from pathlib import Path


def normalize(name):
    text = "".join(str(name or "").split())
    return text if text.startswith("@") else f"@{text}" if text else ""


def parse_many(value):
    for token in str(value or "").replace("，", " ").replace(",", " ").replace(";", " ").replace("；", " ").split():
        creator = normalize(token)
        if creator:
            yield creator


def write_creators(path, creators):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(creators) + ("\n" if creators else ""), encoding="utf-8")


def main():
    skill_dir = Path(__file__).resolve().parents[1]
    default_path = skill_dir / "config" / "creators.txt"
    parser = argparse.ArgumentParser(description="Inspect or replace the Xiaohongshu creator watchlist.")
    parser.add_argument("--path", type=Path, default=default_path, help="Watchlist path.")
    parser.add_argument("--list", action="store_true", help="Print the current watchlist.")
    parser.add_argument("--init", action="store_true", help="Prompt for creators and save the watchlist.")
    parser.add_argument("--set", nargs="*", help="Replace the watchlist with these creator names.")
    args = parser.parse_args()

    if args.init:
        raw = input("Paste Xiaohongshu creators separated by spaces or commas: ").strip()
        creators = list(dict.fromkeys(parse_many(raw)))
        if not creators:
            raise SystemExit("No creators entered.")
        write_creators(args.path, creators)
        print(f"Updated {args.path} with {len(creators)} creators.")
        return

    if args.set is not None:
        creators = [normalize(name) for name in args.set if normalize(name)]
        write_creators(args.path, creators)
        print(f"Updated {args.path} with {len(creators)} creators.")
        return

    if args.list or True:
        if not args.path.exists() or not args.path.read_text(encoding="utf-8").strip():
            print(f"No creators configured in {args.path}. Run with --init or --set @creatorA @creatorB.")
            return
        print(args.path.read_text(encoding="utf-8"), end="")


if __name__ == "__main__":
    main()
