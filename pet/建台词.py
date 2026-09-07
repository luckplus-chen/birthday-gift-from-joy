#!/usr/bin/env /usr/bin/python3
# -*- coding: utf-8 -*-
"""
把 台词.md 编译成 app/assets/台词.json。

用法：/usr/bin/python3 建台词.py
"""
import json, pathlib, re, sys

D = pathlib.Path(__file__).parent
SRC = D / "台词.md"
OUT = D / "app" / "assets" / "台词.json"

# md 里的小标题 → json 里的键
KEYS = {
    "戳一下 · 站着": "poke.idle",
    "戳一下 · 睡觉": "poke.sleep",
    "戳一下 · 工作": "poke.work",
    "戳一下 · 走路": "poke.walk",
    "戳一下 · 被拎着": "poke.lift",
    "第3下": "poke.x3",
    "第5下": "poke.x5",
    "第8下": "poke.x8",
    "拎起来": "grab",
    "放下": "drop",
    "醒来": "wake",
    "开始工作": "enterWork",
    "走完停下": "endWalk",
    "该睡了": "bedtime",
    "工作太久": "tooLong",
    "深夜还在用": "lateNight",
    "第一次见面": "firstMeet",
    "怎么跟我玩": "howto",
    "生日": "birthday",
    "自言自语": "idleTalk",
}

def parse(text):
    """按 ## / ### 标题分节，收集每节下面的 `- ` 行。
       引用行（>）是写给你自己看的注释，不进 json。"""
    pools, cur = {}, None
    for raw in text.splitlines():
        line = raw.rstrip()
        m = re.match(r"^#{2,3}\s+(.*)$", line)
        if m:
            cur = m.group(1).strip()
            pools.setdefault(cur, [])
            continue
        if line.startswith("- ") and cur:
            pools[cur].append(line[2:].strip())
    return pools

def main():
    if not SRC.exists():
        sys.exit("找不到 台词.md")
    pools = parse(SRC.read_text(encoding="utf-8"))

    out, missing, total = {}, [], 0
    for title, key in KEYS.items():
        lines = [l for l in pools.get(title, []) if l]
        if lines:
            out[key] = lines
            total += len(lines)
        else:
            missing.append(title)

    unknown = [t for t in pools if t not in KEYS and pools[t]]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    print(f"✓ {OUT.relative_to(D)}   {len(out)} 组 / {total} 句")
    if missing:
        print("  · 空着的（会回退到「戳一下 · 站着」）：" + "、".join(missing))
    if unknown:
        print("  ⚠ 这些标题我不认识，写了也不会用上：" + "、".join(unknown))
        print("    认识的标题只有：" + "、".join(KEYS))

main()
