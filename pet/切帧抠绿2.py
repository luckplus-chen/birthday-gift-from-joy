#!/usr/bin/env /usr/bin/python3
# -*- coding: utf-8 -*-
"""
切帧抠绿 v2 —— 比 v1 多了三件事：
  · 支持 2×2 这种网格排版（v1 只认横排）
  · 自动清掉烧在图上的帧号标注（按连通块大小过滤）
  · 统一各帧缩放（GPT 常常某一帧画大了，直接播会"胀一下"）

用法：
  /usr/bin/python3 切帧抠绿2.py 输入.png 输出前缀 [--scale] [--order 网格顺序]

例：
  /usr/bin/python3 切帧抠绿2.py gpt返图/睡觉.png 帧/sleep --scale
"""
import sys, os, colorsys
import numpy as np
from PIL import Image, ImageFilter

def opts():
    a = sys.argv[1:]
    if len(a) < 2: print(__doc__); sys.exit(1)
    o = {"src": a[0], "out": a[1], "scale": "--scale" in a,
         "anchor": "--anchor" in a}
    return o

# ---------- 抠绿 ----------
def key_green(im):
    im = im.convert("RGB")
    arr = np.asarray(im).astype(np.float32) / 255.0
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    mx, mn = arr.max(2), arr.min(2)
    v = mx
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    # 色相
    d = np.maximum(mx - mn, 1e-6)
    h = np.zeros_like(mx)
    m = (mx == g); h[m] = ((b - r) / d)[m] / 6.0 + 1/3
    m = (mx == r); h[m] = ((g - b) / d)[m] / 6.0
    m = (mx == b); h[m] = ((r - g) / d)[m] / 6.0 + 2/3
    h = h % 1.0
    bg = (h > 0.236) & (h < 0.444) & (s > 0.45) & (v > 0.30)
    alpha = np.where(bg, 0, 255).astype(np.uint8)

    # 羽化边缘，不然锯齿很硬
    am = Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.9))
    # 这里必须 int32：(255-70)*255 = 47175 会溢出 int16，把角色一起抠掉
    alpha = np.asarray(am).astype(np.int32)
    alpha = np.clip((alpha - 70) * 255 // 120, 0, 255).astype(np.uint8)

    # 去绿边：只在轮廓附近做，避免把玉坠的青绿也洗掉
    solid = Image.fromarray((alpha > 0).astype(np.uint8) * 255)
    inner = np.asarray(solid.filter(ImageFilter.MinFilter(7)))
    band = (alpha > 0) & (inner == 0)
    rgb = np.asarray(im).astype(np.int16)
    cap = (rgb[..., 0].astype(np.int16) + rgb[..., 2]) // 2
    over = band & (rgb[..., 1] > cap)
    rgb[..., 1] = np.where(over, cap, rgb[..., 1])
    im = Image.fromarray(rgb.astype(np.uint8), "RGB")
    return im, alpha

# ---------- 连通块（两遍 union-find） ----------
def label_cc(mask):
    H, W = mask.shape
    lab = np.zeros((H, W), np.int32)
    parent = [0]
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x
    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb: parent[max(ra, rb)] = min(ra, rb)
    nxt = 1
    for y in range(H):
        row = mask[y]
        if not row.any(): continue
        up = lab[y-1] if y else None
        left = 0
        for x in np.flatnonzero(row):
            u = up[x] if up is not None else 0
            ul = up[x-1] if (up is not None and x) else 0
            ur = up[x+1] if (up is not None and x+1 < W) else 0
            l = left if (x and row[x-1]) else 0
            cands = [c for c in (u, ul, ur, l) if c]
            if cands:
                c0 = min(cands); lab[y, x] = c0
                for c in cands: union(c0, c)
            else:
                parent.append(nxt); lab[y, x] = nxt; nxt += 1
            left = lab[y, x]
    if nxt == 1: return lab, {}
    roots = np.arange(nxt)
    for i in range(1, nxt): roots[i] = find(i)
    lab = roots[lab]
    ids, counts = np.unique(lab[lab > 0], return_counts=True)
    return lab, dict(zip(ids.tolist(), counts.tolist()))

def drop_small(alpha, frac=0.04):
    """清掉小碎块——帧号标注、零星噪点"""
    lab, sizes = label_cc(alpha > 40)
    if not sizes: return alpha, 0
    biggest = max(sizes.values())
    kill = [i for i, n in sizes.items() if n < biggest * frac]
    if kill:
        alpha = alpha.copy()
        alpha[np.isin(lab, kill)] = 0
    return alpha, len(kill)

# ---------- 网格切分 ----------
def runs(occupied, min_len):
    out, s = [], None
    for i, v in enumerate(occupied):
        if v and s is None: s = i
        elif not v and s is not None:
            if i - s >= min_len: out.append((s, i))
            s = None
    if s is not None and len(occupied) - s >= min_len: out.append((s, len(occupied)))
    return out

def main():
    o = opts()
    im, alpha = key_green(Image.open(o["src"]))
    H, W = alpha.shape
    alpha, killed = drop_small(alpha)
    print(f"抠绿完成 {W}×{H}" + (f"，清掉 {killed} 个小碎块（帧号标注等）" if killed else ""))

    mask = alpha > 40
    cols = runs(mask.any(0), max(8, W // 60))
    rows = runs(mask.any(1), max(8, H // 60))
    print(f"识别版式：{len(rows)} 行 × {len(cols)} 列 = {len(rows)*len(cols)} 帧")

    rgba = np.dstack([np.asarray(im), alpha])
    full = Image.fromarray(rgba)

    crops = []
    for (y0, y1) in rows:
        for (x0, x1) in cols:
            c = full.crop((x0, y0, x1, y1))
            bb = c.getbbox()
            crops.append(c.crop(bb) if bb else c)

    # 统一缩放：以各帧内容高度的中位数为准
    if o["scale"] and len(crops) > 1:
        # 用不透明像素面积当基准：面积随缩放的平方变化，
        # 比内容高度更能抓到"这一帧整个人画大了"
        areas = [int((np.asarray(c)[..., 3] > 40).sum()) for c in crops]
        med = sorted(areas)[len(areas)//2]
        fixed = []
        for i, (c, a) in enumerate(zip(crops, areas), 1):
            f = (med / a) ** 0.5 if a else 1.0
            if abs(f - 1) > 0.015:
                c = c.resize((max(1, round(c.width*f)), max(1, round(c.height*f))), Image.LANCZOS)
                print(f"  第{i}帧缩放 ×{f:.3f}（原本偏{'大' if f < 1 else '小'}）")
            fixed.append(c)
        crops = fixed

    # --anchor：按画面里那件"本该完全静止的道具"（木桌）对齐。
    # 不这么做的话，桌子会跟着人物一起漂，静止的东西在动最扎眼。
    anchor_box = None
    if o["anchor"] and len(crops) > 1:
        def wood_bbox(img):
            """按色相找木头。不能写死 RGB 区间——深胡桃和浅原木差很多，
               上一版阈值是照深色桌子调的，遇到浅木桌只能识别到一部分。"""
            a = np.asarray(img).astype(np.float32)
            al = a[..., 3]
            rgb = a[..., :3] / 255.0
            mx, mn = rgb.max(2), rgb.min(2)
            d = np.maximum(mx - mn, 1e-6)
            r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
            hue = np.zeros_like(mx)
            k = (mx == r); hue[k] = (((g - b) / d)[k] % 6) / 6
            k = (mx == g); hue[k] = (((b - r) / d)[k] + 2) / 6
            k = (mx == b); hue[k] = (((r - g) / d)[k] + 4) / 6
            sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
            # 橙棕色相 15°–48°，中等饱和，避开高光和阴影
            m = (al > 60) & (hue > 0.042) & (hue < 0.133) & (sat > 0.22) & (mx > 0.32) & (mx < 0.95)
            ys, xs = np.where(m)
            return (xs.min(), xs.max(), ys.min(), ys.max()) if len(xs) else None

        boxes = [wood_bbox(c) for c in crops]
        if all(boxes):
            widths = sorted(bx[1] - bx[0] for bx in boxes)
            tw = widths[len(widths)//2]
            fixed, boxes2 = [], []
            for i, (c, bx) in enumerate(zip(crops, boxes), 1):
                f = tw / (bx[1] - bx[0])
                if abs(f - 1) > 0.005:
                    c = c.resize((max(1, round(c.width*f)), max(1, round(c.height*f))), Image.LANCZOS)
                    print(f"  第{i}帧按桌宽缩放 ×{f:.4f}")
                fixed.append(c); boxes2.append(wood_bbox(c))
            crops = fixed
            xs0 = sorted(bx[0] for bx in boxes2); ys1 = sorted(bx[3] for bx in boxes2)
            anchor_box = (xs0[len(xs0)//2], ys1[len(ys1)//2], boxes2)
            print(f"  已按木桌对齐：左缘统一到 x={anchor_box[0]}，桌底统一到 y={anchor_box[1]}")

    pad = 8
    os.makedirs(os.path.dirname(o["out"]) or ".", exist_ok=True)
    import glob as _g
    for old_f in _g.glob(f"{o['out']}_*.png"):
        os.remove(old_f)

    if anchor_box:
        # 让每帧的木桌左缘和桌底都落在画布上的同一点：
        #   粘贴偏移 + 道具坐标 = 目标坐标
        tx, ty, boxes2 = anchor_box
        offs = [(tx - bx[0], ty - bx[3]) for bx in boxes2]
        minx = min(ox for ox, _ in offs); miny = min(oy for _, oy in offs)
        offs = [(ox - minx + pad, oy - miny + pad) for ox, oy in offs]
        Wc = max(ox + c.width for (ox, _), c in zip(offs, crops)) + pad
        Hc = max(oy + c.height for (_, oy), c in zip(offs, crops)) + pad
        for i, (c, (ox, oy)) in enumerate(zip(crops, offs), 1):
            cv = Image.new("RGBA", (Wc, Hc), (0, 0, 0, 0))
            cv.paste(c, (ox, oy), c)
            cv.save(f"{o['out']}_{i}.png")
        Wm, Hm = Wc - pad*2, Hc - pad*2
    else:
        Wm = max(c.width for c in crops); Hm = max(c.height for c in crops)
        for i, c in enumerate(crops, 1):
            cv = Image.new("RGBA", (Wm+pad*2, Hm+pad*2), (0, 0, 0, 0))
            cv.paste(c, ((Wm-c.width)//2+pad, Hm-c.height+pad), c)
            cv.save(f"{o['out']}_{i}.png")

    print(f"\n✓ {len(crops)} 帧，统一 {Wm+pad*2}×{Hm+pad*2}，底部对齐")

main()
