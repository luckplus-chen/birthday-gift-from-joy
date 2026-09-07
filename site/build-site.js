#!/usr/bin/env node
/**
 * build-site.js
 * 把 index.html + styles.css + content.js + script.js + 三个字体
 * 打包成「一个文件」，双击就能开，断网也能开，也能直接发给他。
 *
 * 用法：
 *   node build-content.js      先把 content.md 转成 content.js
 *   node build-site.js         再打包
 *
 * 产出：
 *   ../生日快乐.html    ← 给你用的：双击打开 / 发给他 / 传到任何空间
 *   _artifact.html      ← 给我用的：发布成网址时用
 */

const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const read = (f) => fs.readFileSync(path.join(DIR, f), "utf8");
const b64 = (f) => fs.readFileSync(path.join(DIR, f)).toString("base64");

/* ---------- 字体：整套内嵌，所以断网也有手写体 ---------- */
/* 中文用楷体，Mac 自带，不内嵌——省 5MB，而且比龙藏好读得多。
   这里只剩英文手写体和等宽字体要带。 */
const FONTS_FULL = [
  { file: "fonts/Caveat.ttf",   family: "Caveat",    weight: 400 },
  { file: "fonts/PlexMono.ttf", family: "IBM Plex Mono", weight: 400 },
];
const FONTS_LITE = FONTS_FULL;

function fontBlock(FONTS) {
  const faces = FONTS.map((f) => {
    if (!fs.existsSync(path.join(DIR, f.file))) {
      console.warn(`  ⚠ 缺字体 ${f.file}，这个字体会退回系统字体`);
      return "";
    }
    return `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.weight};` +
           `font-display:swap;src:url(data:font/ttf;base64,${b64(f.file)}) format('truetype');}`;
  }).filter(Boolean).join("\n");
  return `<style id="embedded-fonts">\n${faces}\n</style>`;
}

/* ---------- 把 photo/ 里引用到的图片也内嵌 ----------
   不做这一步，单文件版里的蛋糕图会变成裂图。 */
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
               ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
               ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".wav": "audio/wav" };

/* withAudio=false 时把音乐整段去掉（发布版塞不下，会超上传上限） */
function inlineAssets(js, withAudio) {
  if (!withAudio) {
    js = js.replace(/"music\/[^"]+"/g, '""');
  }
  let n = 0, bytes = 0;
  const out = js.replace(/"((?:photo|music)\/[^"]+)"/g, (m, rel) => {
    const abs = path.join(DIR, rel);
    if (!fs.existsSync(abs)) {
      console.warn(`  ⚠ 找不到图片 ${rel}，网页上会是裂图`);
      return m;
    }
    const ext = path.extname(rel).toLowerCase();
    const mime = MIME[ext];
    if (!mime) { console.warn(`  ⚠ 不支持的图片格式 ${ext}`); return m; }
    n++; bytes += fs.statSync(abs).size;
    return `"data:${mime};base64,${b64(rel)}"`;
  });
  if (n) console.log(`  · 内嵌素材 ${n} 个（${(bytes / 1048576).toFixed(1)} MB）`);
  return out;
}

/* ---------- 组装 ---------- */
function build() {
  const html = read("index.html");
  const css = read("styles.css");
  const contentRaw = read("content.js");
  const script = read("script.js");

  // 抠出 <body> 里的内容
  const bodyInner = html.slice(
    html.indexOf("<body>") + "<body>".length,
    html.lastIndexOf("</body>")
  )
    // 外链的 css / js 全部换成内嵌，去掉 Google Fonts（内嵌了就不需要了）
    .replace(/<script src="content\.js"><\/script>/, "")
    .replace(/<script src="script\.js"><\/script>/, "");

  const title = (html.match(/<title>(.*?)<\/title>/) || [, "给你的"])[1];

  const mkScripts = (withAudio) =>
    `<script>\n${inlineAssets(contentRaw, withAudio)}\n</script>\n<script>\n${script}\n</script>`;

  /* 字体放在最后：HTML 是边下边渲染的，
     先让文字用系统字体显示出来，手写体随后自己换上，
     不会开局白屏几秒。 */
  const assemble = (fonts, withAudio) => [
    `<style>\n${css}\n</style>`,
    bodyInner.trim(),
    mkScripts(withAudio),
    fontBlock(fonts),
  ].join("\n\n");

  // 1) 独立文件：双击就能开，字体全内嵌
  const standalone =
    `<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1.0">\n` +
    `<title>${title}</title>\n</head>\n<body>\n${assemble(FONTS_FULL, true)}\n</body>\n</html>\n`;

  const outStandalone = path.join(DIR, "..", "生日快乐.html");
  fs.writeFileSync(outStandalone, standalone, "utf8");

  // 2) 发布版：不带 doctype/html/head/body，外层由发布平台包
  fs.writeFileSync(
    path.join(DIR, "_artifact.html"),
    `<title>${title}</title>\n\n${assemble(FONTS_LITE, false)}\n`,
    "utf8"
  );

  const mb = (p) => (fs.statSync(p).size / 1048576).toFixed(1);
  console.log("✓ 打包完成\n");
  console.log(`  生日快乐.html   ${mb(outStandalone)} MB  ← 双击就能开，断网也行，手写体完整`);
  console.log(`  _artifact.html  ${mb(path.join(DIR, "_artifact.html"))} MB  ← 发布成网址用（无音乐、中文走系统手写体）`);
  console.log("\n改了内容之后，先跑 build-content.js，再跑这个。");
}

build();
