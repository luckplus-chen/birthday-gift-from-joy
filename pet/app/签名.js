/* electron-builder 的 afterPack 钩子：给整个 .app 做 ad-hoc 签名。
   不做这步的话，包里只有链接器留下的那点签名（Sealed Resources=none），
   macOS 会当成"应用已损坏"——那个弹窗只有「移到废纸篓」，没有任何打开的办法。
   正确 ad-hoc 签过之后才会变成正常的"无法验证开发者"，
   他才能去 系统设置 → 隐私与安全性 里点「仍要打开」。
   （买了苹果开发者账号才能真正免掉这一步，99 美元一年。） */
const { execFileSync } = require("child_process");
const path = require("path");

exports.default = async function (ctx) {
  if (ctx.electronPlatformName !== "darwin") return;
  /* 打通用包时 electron-builder 会先分别产出 x64 和 arm64 两个临时目录，
     再合并。这两个如果各自签过，_CodeSignature/CodeResources 内容不一样，
     合并那步会直接报「Expected all non-binary files to have identical SHAs」。
     所以只签最后合并出来的那一个。 */
  if (/-(x64|arm64|armv7l|ia32)-temp$/.test(ctx.appOutDir)) return;
  const app = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "inherit" });
  console.log("  • ad-hoc 签名完成并校验通过  " + path.basename(app));
};
