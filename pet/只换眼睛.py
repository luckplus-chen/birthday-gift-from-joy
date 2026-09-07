#!/usr/bin/env /usr/bin/python3
# -*- coding: utf-8 -*-
"""
眨眼帧修复：身体固定用第1帧，只把眼睛那一块从其余帧贴过来。

GPT 画多帧时会把头发丝、衣褶都重画一遍，直接播会整个人在抖。
眨眼实际上只有眼皮在动，所以把身体锁死才是对的。

用法：/usr/bin/python3 只换眼睛.py 帧/idle2
"""
import sys, glob
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

pre = sys.argv[1] if len(sys.argv) > 1 else "帧/idle2"
fs = sorted(glob.glob(f"{pre}_*.png"), key=lambda p: int(p.split('_')[-1].split('.')[0]))
ims = [Image.open(f).convert("RGBA") for f in fs]
A = [np.asarray(i).astype(np.int16) for i in ims]
H, W, _ = A[0].shape
print(f"{len(ims)} 帧  {W}×{H}")

# 眼睛区域按几何位置框，不能按"帧间差异最大"去找——
# GPT 每帧连头发丝都重画，那样框出来会是整个上半身，头发照样抖。
FX0, FX1, FY0, FY1 = 0.24, 0.76, 0.16, 0.33
x0, x1 = int(W * FX0), int(W * FX1)
y0, y1 = int(H * FY0), int(H * FY1)
print(f"眼睛区域: x {x0}–{x1}, y {y0}–{y1}  （按比例框，只罩住眼镜）")

# 羽化的贴片遮罩，避免看到接缝
mask = Image.new("L", (W, H), 0)
ImageDraw.Draw(mask).rounded_rectangle([x0, y0, x1, y1], radius=14, fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(5))

base = ims[0]
out = [base]
for i, im in enumerate(ims[1:], 2):
    comp = base.copy()
    comp.paste(im, (0, 0), mask)        # 只有眼睛那块换成新的
    out.append(comp)

for i, im in enumerate(out, 1):
    im.save(f"{pre}_{i}.png")

# 复测
B = [np.asarray(i).astype(np.int16) for i in out]
eye = np.zeros((H, W), bool); eye[y0:y1, x0:x1] = True
print("\n修复后，身体（眼睛以外）的差异：")
for i, a in enumerate(B[1:], 2):
    dd = np.abs(a[..., :3] - B[0][..., :3]).sum(2)
    op = ((a[..., 3] > 60) | (B[0][..., 3] > 60)) & ~eye
    print(f"  帧{i}: {((dd > 40) & op).sum() / op.sum() * 100:.3f}%")
