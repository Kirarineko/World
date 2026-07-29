import os
import re
import sys
from pathlib import Path
from collections import defaultdict

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

EXCLUDE_DIRS = {'.git', '.opencode', '.kagent', 'node_modules', '__pycache__', '.idea', '.vs', 'site-packages', 'dist', 'build'}


def is_excluded_file(p):
    name = p.name
    if name in {'README.md', 'AGENTS.md'}:
        return True
    if name.upper().startswith('LICENSE'):
        return True
    return False

HANZI_RE = re.compile(r'[\u4e00-\u9fff\u3400-\u4dbf]')
KANA_RE = re.compile(r'[\u3040-\u309f\u30a0-\u30ff]')
WORD_RE = re.compile(r'[a-zA-Z]+')
SPACE_RE = re.compile(r'\s')


def count_text(text):
    hanzi = len(HANZI_RE.findall(text))
    kana = len(KANA_RE.findall(text))
    yword = len(WORD_RE.findall(text))
    return {
        'zishu': hanzi + kana + yword,
        'hanzi': hanzi,
        'kana': kana,
        'yword': yword,
        'chars': len(text),
        'nonspace': len(SPACE_RE.sub('', text)),
    }


def main():
    root = Path('.')
    rows = []
    for p in sorted(root.rglob('*.md'), key=lambda x: str(x).lower()):
        if any(part in EXCLUDE_DIRS for part in p.parts):
            continue
        if is_excluded_file(p):
            continue
        try:
            text = p.read_text(encoding='utf-8', errors='replace')
        except Exception as e:
            print(f'读取失败 {p}: {e}')
            continue
        rows.append((p, count_text(text)))

    groups = defaultdict(lambda: defaultdict(int))
    for p, c in rows:
        top = p.parts[0] if len(p.parts) > 1 else '(根目录)'
        for k, v in c.items():
            groups[top][k] += v
        groups[top]['files'] += 1

    print('=' * 70)
    print('世界观设定字数统计')
    print('=' * 70)
    print(f'{"目录":<28}{"文件":>6}{"字数":>12}{"总字符":>14}')
    print('-' * 70)
    total = defaultdict(int)
    for top in sorted(groups.keys(), key=str.lower):
        g = groups[top]
        print(f'{top:<28}{g["files"]:>6}{g["zishu"]:>12}{g["chars"]:>14}')
        for k, v in g.items():
            total[k] += v
    print('-' * 70)
    print(f'{"合计":<28}{total["files"]:>6}{total["zishu"]:>12}{total["chars"]:>14}')
    print('=' * 70)
    print()
    print(f'  文件数                    : {total["files"]}')
    print(f'  字数(汉字+假名+英文单词) : {total["zishu"]}')
    print(f'      其中汉字              : {total["hanzi"]}')
    print(f'      其中日文假名          : {total["kana"]}')
    print(f'      其中英文单词          : {total["yword"]}')
    print(f'  总字符数(含空白)          : {total["chars"]}')
    print(f'  非空白字符数              : {total["nonspace"]}')
    print()

    print('篇幅前 10 的文件:')
    print(f'  {"文件":<52}{"字数":>10}')
    for p, c in sorted(rows, key=lambda x: x[1]['zishu'], reverse=True)[:10]:
        disp = str(p).replace('\\', '/')
        if len(disp) > 50:
            disp = '...' + disp[-49:]
        print(f'  {disp:<52}{c["zishu"]:>10}')


if __name__ == '__main__':
    main()