#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""统计《青空归处：心火长明》世界观设定正文的字数。

只统计设定正文，排除以下非设定文档：
  - 导航索引：任意层级的「上下文索引.md」
  - 项目说明与工作约束：根目录 README.md、全库 AGENTS.md
  - 许可证：文件名以 LICENSE 开头的文件
  - 创作备忘与草稿：文件名含「备忘录」、*.draft.md、*.bak.md、scratch/ 目录
  - Agent 禁读目录：目录名含「禁止读取」，脚本不会进入其内部
  - 工具与版本控制目录：.git/.agents/.workbuddy/node_modules 等

注意：世界观内的「项目说明」仍属设定正文，例如
宇宙/本地泡/研究/GPU与魔力的干涉/README.md（浅紫视角的 Mojolib 说明），会计入。

口径：字数 = 汉字 + 日文假名 + 英文单词；另有非空白字符数（含标点）供参考。

用法：
    python count_setting_words.py                 # 分组汇总 + 篇幅前 10
    python count_setting_words.py --excluded      # 额外列出被排除的文件
    python count_setting_words.py --detail        # 额外列出每个计入文件的字数
    python count_setting_words.py --csv out.csv   # 导出每个文件的统计
"""

from __future__ import annotations

import argparse
import csv
import fnmatch
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = Path(__file__).resolve().parent

# 工具、版本控制与缓存目录，一律不进入
EXCLUDE_DIRS = {
    ".git", ".agents", ".workbuddy", ".opencode", ".kagent",
    ".idea", ".vs", "node_modules", "__pycache__", "dist", "build",
    "site-packages", "scratch",
}

# Agent 禁读标记：目录名出现该标记即跳过，绝不进入内部遍历
FORBIDDEN_DIR_MARKERS = ("禁止读取",)

# 非设定文件（按文件名匹配，不含路径）
EXCLUDE_FILES = {"AGENTS.md", "上下文索引.md"}
EXCLUDE_FILE_PATTERNS = ("*备忘录*", "*.draft.md", "*.bak.md")

HANZI_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
KANA_RE = re.compile(r"[\u3040-\u30ff]")
LATIN_RE = re.compile(r"[A-Za-z]+")
SPACE_RE = re.compile(r"\s")


def is_forbidden_dir(name: str) -> bool:
    return any(marker in name for marker in FORBIDDEN_DIR_MARKERS)


def classify_excluded(name: str, rel: Path) -> str | None:
    """返回排除类别；None 表示计入。"""
    if name == "上下文索引.md":
        return "导航索引"
    if name in EXCLUDE_FILES:
        return "项目说明/工作约束"
    if rel.parent == Path(".") and name == "README.md":
        return "项目介绍"
    if name.upper().startswith("LICENSE"):
        return "许可证"
    for pattern in EXCLUDE_FILE_PATTERNS:
        if fnmatch.fnmatch(name.lower(), pattern.lower()):
            return "备忘/草稿"
    return None


def iter_markdown():
    """遍历 Markdown，按目录名剪枝，禁读目录不会被打开。"""
    for dirpath, dirnames, filenames in os.walk(ROOT):
        kept = []
        for d in sorted(dirnames):
            if d in EXCLUDE_DIRS or is_forbidden_dir(d):
                continue
            kept.append(d)
        dirnames[:] = kept
        for fn in sorted(filenames):
            if fn.lower().endswith(".md"):
                yield Path(dirpath) / fn


def count_text(text: str) -> dict[str, int]:
    hanzi = len(HANZI_RE.findall(text))
    kana = len(KANA_RE.findall(text))
    latin = len(LATIN_RE.findall(text))
    return {
        "zishu": hanzi + kana + latin,
        "hanzi": hanzi,
        "kana": kana,
        "latin": latin,
        "chars": len(text),
        "nonspace": len(SPACE_RE.sub("", text)),
    }


def group_of(rel: Path) -> str:
    """按设定分区归组，城市细化到具体城市。"""
    dirs = rel.parent.parts
    if not dirs:
        return "根层机制"
    if dirs[:2] == ("宇宙", "本地泡"):
        if len(dirs) >= 5 and dirs[2] == "城市":
            return "/".join(dirs[:5])
        if len(dirs) >= 3:
            return "/".join(dirs[:3])
        return "宇宙/本地泡"
    return dirs[0]


def disp_width(s: str) -> int:
    return sum(2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1 for ch in s)


def pad(s: str, width: int, right: bool = False) -> str:
    fill = " " * max(0, width - disp_width(s))
    return fill + s if right else s + fill


def main() -> int:
    parser = argparse.ArgumentParser(description="统计世界观设定正文字数")
    parser.add_argument("--excluded", action="store_true", help="列出被排除的文件")
    parser.add_argument("--detail", action="store_true", help="列出每个计入文件的字数")
    parser.add_argument("--csv", metavar="PATH", help="把逐文件统计导出为 CSV")
    args = parser.parse_args()

    rows: list[tuple[Path, dict[str, int]]] = []
    excluded: list[tuple[Path, str]] = []

    for p in iter_markdown():
        rel = p.relative_to(ROOT)
        category = classify_excluded(p.name, rel)
        if category:
            excluded.append((rel, category))
            continue
        try:
            text = p.read_text(encoding="utf-8-sig", errors="replace")
        except OSError as exc:
            print(f"读取失败 {rel.as_posix()}: {exc}", file=sys.stderr)
            continue
        rows.append((rel, count_text(text)))

    groups: dict[str, Counter] = defaultdict(Counter)
    for rel, c in rows:
        g = groups[group_of(rel)]
        g["files"] += 1
        for key, value in c.items():
            g[key] += value

    total: Counter = Counter()
    for g in groups.values():
        total.update(g)

    width = max([disp_width("合计")] + [disp_width(k) for k in groups]) + 2

    print("=" * 78)
    print("《青空归处：心火长明》世界观设定字数统计")
    print("=" * 78)
    print(f"统计目录：{ROOT}")
    print("统计口径：字数 = 汉字 + 假名 + 英文单词；非空白字符含标点")
    print()
    print(
        pad("分组", width) + pad("文件", 6, True) + pad("字数", 10, True)
        + pad("汉字", 10, True) + pad("非空白字符", 12, True)
    )
    print("-" * 78)
    for name, g in sorted(groups.items(), key=lambda kv: kv[1]["zishu"], reverse=True):
        print(
            pad(name, width) + pad(str(g["files"]), 6, True) + pad(str(g["zishu"]), 10, True)
            + pad(str(g["hanzi"]), 10, True) + pad(str(g["nonspace"]), 12, True)
        )
    print("-" * 78)
    print(
        pad("合计", width) + pad(str(total["files"]), 6, True) + pad(str(total["zishu"]), 10, True)
        + pad(str(total["hanzi"]), 10, True) + pad(str(total["nonspace"]), 12, True)
    )
    print("=" * 78)
    print()
    print(f"  计入文件数                : {total['files']}")
    print(f"  字数(汉字+假名+英文单词)  : {total['zishu']}")
    print(f"      其中汉字              : {total['hanzi']}")
    print(f"      其中日文假名          : {total['kana']}")
    print(f"      其中英文单词          : {total['latin']}")
    print(f"  非空白字符数(含标点)      : {total['nonspace']}")
    print(f"  总字符数(含空白)          : {total['chars']}")
    print()

    print("篇幅前 10 的文件：")
    print("  " + pad("文件", 60) + pad("字数", 10, True))
    for rel, c in sorted(rows, key=lambda x: x[1]["zishu"], reverse=True)[:10]:
        name = rel.as_posix()
        if disp_width(name) > 58:
            while disp_width(name) > 58:
                name = name[1:]
            name = "…" + name
        print("  " + pad(name, 60) + pad(str(c["zishu"]), 10, True))
    print()

    by_category = Counter(cat for _, cat in excluded)
    print(f"未计入的文件：{len(excluded)} 个")
    if by_category:
        print("  " + "，".join(f"{cat} {n} 个" for cat, n in by_category.most_common()))
    if args.excluded:
        for rel, cat in sorted(excluded, key=lambda x: (x[1], x[0].as_posix())):
            print(f"  [{cat}] {rel.as_posix()}")
    print("  说明：目录名含「禁止读取」的目录不会被进入或读取。")
    print()

    if args.detail:
        print("逐文件字数：")
        for rel, c in sorted(rows, key=lambda x: x[0].as_posix()):
            print(f"  {pad(rel.as_posix(), 62)}{pad(str(c['zishu']), 10, True)}")
        print()

    if args.csv:
        out = Path(args.csv)
        with out.open("w", encoding="utf-8-sig", newline="") as fh:
            writer = csv.writer(fh)
            writer.writerow(["文件", "字数", "汉字", "假名", "英文单词", "非空白字符", "总字符"])
            for rel, c in sorted(rows, key=lambda x: x[0].as_posix()):
                writer.writerow([
                    rel.as_posix(), c["zishu"], c["hanzi"], c["kana"],
                    c["latin"], c["nonspace"], c["chars"],
                ])
        print(f"已导出 CSV：{out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
