#!/usr/bin/env node
/**
 * build-content.js
 * 把 content.md（你填的）转成 content.js（网页读的）。
 * 用法：node build-content.js
 */

const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const MD = path.join(DIR, "content.md");
const OUT = path.join(DIR, "content.js");
const PLACEHOLDER = "待补充";

/* ---------------- 解析 ---------------- */

function parse(raw) {
  const lines = raw.split(/\r?\n/);
  const sections = [];
  let section = null;
  let lastField = null;
  let inFence = false;

  for (const line of lines) {
    const t = line.trim();

    if (t.startsWith("```")) { inFence = !inFence; lastField = null; continue; }
    if (inFence) continue;

    const h2 = t.match(/^##\s+(?!#)(.*)$/);
    if (h2) {
      section = { title: h2[1].trim(), fields: {}, lines: [] };
      sections.push(section);
      lastField = null;
      continue;
    }

    if (!section) continue;

    /* 「信」和「落款」这两节收的是自由文本，一行一行照抄。
       别的节只认 `- 键: 值`，自由行会被丢掉——落款那两行之前就是这么没的。
       不能用 includes("信")——"基本信息"、"卷信" 都会被误判。 */
    const free = section.title.trim();
    if (free === "信" || free === "落款") {
      if (t.startsWith(">") || t === "---" || t.startsWith("#")) continue;
      section.lines.push(line);
      continue;
    }

    if (!t || t.startsWith(">") || t === "---") { lastField = null; continue; }
    if (t.startsWith("#")) { lastField = null; continue; }

    const kv = t.match(/^-\s+([^:：]+)[:：]\s*(.*)$/);
    if (kv) {
      const key = kv[1].trim();
      section.fields[key] = kv[2].trim();
      lastField = { bag: section.fields, key };
      continue;
    }

    if (lastField) {
      const cur = lastField.bag[lastField.key];
      lastField.bag[lastField.key] = cur ? cur + "\n" + t : t;
    }
  }
  return sections;
}

/* 找章节：先精确匹配，再前缀，最后才是包含。
   不能直接用 includes —— 「火柴（读完信 → 蛋糕 中间的过场）」里有"蛋糕"，
   会把真正的「蛋糕」章节顶掉，那一节就整个失效了。 */
const findSection = (secs, kw) =>
  secs.find((s) => s.title.trim() === kw) ||
  secs.find((s) => s.title.trim().startsWith(kw)) ||
  secs.find((s) => s.title.includes(kw)) ||
  { fields: {}, lines: [] };

const val = (bag, key, fallback = "") => {
  const v = (bag && bag[key] ? String(bag[key]) : "").trim();
  return v || fallback;
};

/* ---------------- 构建 ---------------- */

function build(secs) {
  const metaS   = findSection(secs, "基本信息");
  const passS   = findSection(secs, "密码");
  const letterS = secs.find((s) => s.title.trim() === "信") || { fields: {}, lines: [] };
  const rollS   = findSection(secs, "卷信");
  const matchS  = findSection(secs, "火柴");
  const cakeS   = findSection(secs, "蛋糕");
  const celS    = findSection(secs, "庆祝");
  const darkS   = findSection(secs, "摸黑");
  const giftS   = findSection(secs, "礼物");
  const petS    = findSection(secs, "安装包");
  const hintS   = findSection(secs, "引导提示");
  const bgmS    = findSection(secs, "背景音乐");

  // 信：空行分段
  /* 分段要认两种写法：
       · 段与段之间空一行  → 按空行分，段内的单换行保留成折行
       · 一行就是一段、中间不空行 → 按单换行分
     只支持前一种的话，一行一段写出来的信会被并成一大坨，全文没有段距。 */
  const signS = findSection(secs, "落款");
  const signature = signS.lines
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith(">") && l !== "---");

  const letterRaw = letterS.lines.join("\n").trim();
  const hasBlankLine = /\n\s*\n/.test(letterRaw);
  const paragraphs = (hasBlankLine ? letterRaw.split(/\n\s*\n/) : letterRaw.split(/\n/))
    .map((p) => p.split("\n").map((l) => l.trim()).join("\n").trim())
    .filter(Boolean);

  return {
    meta: {
      hisName: val(metaS.fields, "他的名字", ""),
      age: val(metaS.fields, "岁数", "25").replace(/[^0-9]/g, "") || "25",
    },
    lock: {
      password: val(passS.fields, "密码", "WISH"),
      before: val(passS.fields, "密码框前面的词", ""),
      after: val(passS.fields, "密码框后面的词", ""),
      wrongLines: ["输错第1次", "输错第2次", "输错第3次"]
        .map((k) => val(passS.fields, k)).filter(Boolean),
      success: val(passS.fields, "密码正确后", "是你。那可以开始了。"),
    },
    letter: {
      signature,
      paragraphs: paragraphs.length ? paragraphs : [
        "（信还没写。打开 content.md，找到「## 信」那一节，把占位替换成你自己的话。）",
        "（空一行就是分一段。想写多长写多长，这一页会自动变长。）",
      ],
    },
    roll: {
      cue: val(rollS.fields, "卷信提示", "点击此处，把信卷起来"),
      after: val(rollS.fields, "卷好之后", "收好了。"),
    },
    match: {
      line1: val(matchS.fields, "过场第一句", "信收好了。"),
      line2: val(matchS.fields, "过场第二句", "蜡烛还没点。"),
      cue: val(matchS.fields, "火柴提示", "划一下"),
      lit: val(matchS.fields, "点着之后", "走吧。"),
    },
    cake: {
      img: val(cakeS.fields, "蛋糕图片") ? "photo/" + val(cakeS.fields, "蛋糕图片") : "",
      found: val(cakeS.fields, "发现蛋糕时", "蜡烛我已经替你点好了。"),
      wish: val(cakeS.fields, "许愿引导", "先别急着吹。闭上眼睛，许个愿。"),
      wished: val(cakeS.fields, "许好了", "许好了"),
      hint: val(cakeS.fields, "提示文字", "现在，吹灭它。"),
      sub: val(cakeS.fields, "副提示", "（对着屏幕吹，或者点一下也行。）"),
      flames: ["火苗1位置", "火苗2位置"].map((k) => {
        const m = val(cakeS.fields, k).split(/[,，]/).map((n) => parseFloat(n));
        return (m.length === 2 && !isNaN(m[0]) && !isNaN(m[1])) ? { x: m[0], y: m[1] } : null;
      }).filter(Boolean),
      flameSize: parseInt(val(cakeS.fields, "火苗大小", "46"), 10) || 46,
    },
    celebrate: {
      cn: val(celS.fields, "中文那句", "生日快乐，亲爱的{name}！"),
      en: val(celS.fields, "英文那句", "Happy Birthday and Happy Everyday!!!"),
      button: val(celS.fields, "继续按钮", "还有东西"),
    },
    dark: {
      line1: val(darkS.fields, "第一句", "蜡烛灭了，屋里一下就黑了。"),
      cue: val(darkS.fields, "摸索提示", "摸黑找找看"),
      found: val(darkS.fields, "找到之后", "在这儿。"),
    },
    gift: {
      hint: val(giftS.fields, "提示文字", "这个是给你的。"),
      sub: val(giftS.fields, "副提示", "（点一下）"),
      opened: val(giftS.fields, "打开之后", ""),
    },
    pet: {
      desc: val(petS.fields, "说明", ""),
      filename: val(petS.fields, "安装包文件名", "陪着你.dmg"),
      button: val(petS.fields, "下载按钮", "带它回家"),
      note: val(petS.fields, "备注", ""),
      firstRun: val(petS.fields, "第一次打开", ""),
      url: val(petS.fields, "安装包地址", ""),
    },
    hints: {
      delay: (parseInt(val(hintS.fields, "停几秒后出现", "6"), 10) || 6) * 1000,
      lock: val(hintS.fields, "密码这一步", "在这里输入"),
      letter: val(hintS.fields, "读信这一步", "往下滑，接着读"),
      roll: val(hintS.fields, "卷信这一步", "点这里"),
      match: val(hintS.fields, "火柴这一步", "划一下火柴"),
      wish: val(hintS.fields, "许愿这一步", "许好了就点这里"),
      cake: val(hintS.fields, "蛋糕这一步", "吹灭蜡烛"),
      dark: val(hintS.fields, "摸黑这一步", "拖着光找找"),
      celebrate: val(hintS.fields, "庆祝这一步", "点这里继续"),
      gift: val(hintS.fields, "礼物这一步", "点开它"),
      pet: val(hintS.fields, "安装包这一步", "点这里"),
    },
    bgm: {
      letter: (v => v ? "music/" + v : "")(val(bgmS.fields, "读信时的歌", "")),
      cake:   (v => v ? "music/" + v : "")(val(bgmS.fields, "蜡烛时的歌", "")),
      gift:   (v => v ? "music/" + v : "")(val(bgmS.fields, "礼物时的歌", "")),
      autoplay: !/^(否|no|false)/i.test(val(bgmS.fields, "默认开启", "是")),
      volume: Math.min(100, Math.max(0, parseInt(val(bgmS.fields, "音量", "30"), 10) || 30)) / 100,
    },
  };
}

/* ---------------- 输出 ---------------- */

function main() {
  if (!fs.existsSync(MD)) { console.error("✗ 找不到 content.md"); process.exit(1); }

  const data = build(parse(fs.readFileSync(MD, "utf8")));
  const banner =
    "/* 本文件由 build-content.js 自动生成，不要手改。\n" +
    "   改内容请编辑 content.md，然后重新运行：node build-content.js */\n\n";
  fs.writeFileSync(OUT, banner + "const CONTENT = " + JSON.stringify(data, null, 2) + ";\n", "utf8");

  const words = data.letter.paragraphs.join("").length;
  const unwritten = data.letter.paragraphs[0].startsWith("（信还没写");

  console.log("✓ content.js 已更新\n");
  console.log(`  名字      ${data.meta.hisName || "⚠ 还没填"}`);
  console.log(`  蜡烛      ${data.meta.age}`);
  console.log(`  信        ${unwritten ? "⚠ 还没写" : `${data.letter.paragraphs.length} 段 / 约 ${words} 字`}`);
  console.log(`  落款      ${data.letter.signature.length ? data.letter.signature.join(" / ") : "（空）"}`);
  console.log(`  蛋糕图    ${data.cake.img || "（用占位蛋糕）"}`);
  console.log(`  火苗      ${data.cake.flames.length} 簇`);
  const tracks = [["读信",data.bgm.letter],["蜡烛",data.bgm.cake],["礼物",data.bgm.gift]]
    .filter(([,v])=>v).map(([k,v])=>`${k}=${v}`);
  console.log(`  音乐      ${tracks.length ? tracks.join("  ") : "（未设置）"}`);
  console.log("\n刷新浏览器就能看到。");
}

main();
