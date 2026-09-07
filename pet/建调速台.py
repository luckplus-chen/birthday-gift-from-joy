#!/usr/bin/env /usr/bin/python3
# -*- coding: utf-8 -*-
"""
生成 调速台.html —— 把 帧/ 里的图和 动画参数.json 的当前值烤进一个单文件网页。

以前调速台是手写的，帧一换就得整个重贴 base64。改成脚本之后：
    /usr/bin/python3 建调速台.py
帧变了、参数变了，重跑一次就行。
"""
import base64, json, pathlib

D = pathlib.Path(__file__).parent
P = json.loads((D / "动画参数.json").read_text(encoding="utf-8"))

def b64(name):
    raw = (D / "帧" / f"{name}.png").read_bytes()
    return "data:image/png;base64," + base64.b64encode(raw).decode()

def arr(names):
    return "[" + ",".join(f'"{b64(n)}"' for n in names) + "]"

idle  = arr([f"idle3_{i}" for i in (1, 2, 3, 4)])
walk  = arr([f"walk_{i}"  for i in range(1, 7)])
sleep = arr([f"sleep_{i}" for i in (1, 2, 3, 4)])
work  = arr([f"work2_{i}" for i in (1, 2, 3, 4)])
lift  = f'"{b64("lift_1")}"'

br, bl, wk, sl, wo, lf = (P["待机呼吸"], P["眨眼"], P["走路"],
                          P["睡觉呼吸"], P["打字"], P["拎起来"])

HTML = f"""<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<title>桌宠调速台</title><style>
*{{box-sizing:border-box}}
body{{background:#241a14;color:#f0e6d6;font-family:ui-monospace,monospace;margin:0;padding:26px 30px 70px}}
h1{{font-size:16px;letter-spacing:.1em;margin:0 0 6px;font-weight:500}}
p.n{{color:#a4917c;font-size:12px;line-height:1.85;margin:0 0 22px;max-width:78ch}}
.card{{background:#2e211a;border:1px solid #4a3628;border-radius:12px;padding:20px 24px;
  margin-bottom:18px;display:flex;gap:30px;align-items:flex-start;flex-wrap:wrap}}
.view{{width:300px;flex-shrink:0}}
.view h2{{font-size:13px;color:#e0a75e;margin:0 0 2px;font-weight:500;letter-spacing:.05em}}
.view .s{{font-size:11px;color:#9c8a76;margin-bottom:12px}}
.stage{{height:290px;display:flex;align-items:flex-end;justify-content:center;
  background:#281c15;border-radius:8px;position:relative;overflow:hidden}}
.stage img{{display:block;transform-origin:50% 100%}}
.lane img{{position:absolute;bottom:8px}}
#liftStage{{height:390px;cursor:grab;user-select:none}}
#liftStage.grab{{cursor:grabbing}}
#liftImg{{position:absolute}}
.floor{{position:absolute;left:0;right:0;bottom:8px;height:1px;background:#4a3628}}
.ctls{{flex:1;min-width:330px;padding-top:4px}}
.ctl{{display:flex;align-items:center;gap:12px;margin-bottom:11px;font-size:12px}}
.ctl label{{width:112px;color:#c0ab92;flex-shrink:0}}
.ctl input{{flex:1;accent-color:#e0a75e;min-width:130px}}
.ctl b{{width:86px;text-align:right;color:#e0a75e;font-weight:500;flex-shrink:0}}
.tip{{font-size:11px;color:#7f6f5d;margin-top:10px;line-height:1.75}}
#out{{background:#1c130e;border:1px solid #5a4230;border-radius:12px;padding:20px 24px;margin-top:24px}}
#out h2{{font-size:13px;color:#e0a75e;margin:0 0 10px;font-weight:500}}
pre{{background:#120c08;border-radius:8px;padding:14px 16px;font-size:12px;line-height:1.95;
  color:#d8c9b4;overflow-x:auto;margin:0 0 12px}}
button{{background:#e0a75e;color:#241708;border:none;border-radius:999px;padding:10px 22px;
  font-family:inherit;font-size:12px;font-weight:600;cursor:pointer}}
button:hover{{filter:brightness(1.08)}}
#msg{{margin-left:14px;font-size:12px;color:#8fc48f;opacity:0;transition:opacity .3s}}
#msg.on{{opacity:1}}
</style></head><body>
<h1>桌宠调速台 · 完整版</h1>
<p class="n">五个动作全在这儿，用的是最新的帧（待机已换成长腿版 idle3）。
拨舒服之后点最下面<b>复制参数</b>，粘给我。</p>

<div class="card">
  <div class="view"><h2>待机</h2><div class="s">呼吸 + 随机眨眼</div>
    <div class="stage"><img id="idleImg" style="height:270px"></div></div>
  <div class="ctls">
    <div class="ctl"><label>呼吸周期</label><input type="range" id="brMs" min="2000" max="9000" step="100" value="{br['周期毫秒']}"><b id="brMsV"></b></div>
    <div class="ctl"><label>呼吸上浮</label><input type="range" id="brY" min="0" max="8" step="1" value="{br['上浮px']}"><b id="brYV"></b></div>
    <div class="ctl"><label>眨眼快慢</label><input type="range" id="blMs" min="50" max="240" step="10" value="{bl['每帧毫秒']}"><b id="blMsV"></b></div>
    <div class="ctl"><label>多久眨一次</label><input type="range" id="blGap" min="1500" max="14000" step="500" value="{bl['平均间隔毫秒']}"><b id="blGapV"></b></div>
    <p class="tip">眨眼间隔会自动随机化（0.55–1.45 倍），不然像定时器。<br>
      呼吸上浮调到 0 就是完全静止。</p></div>
</div>

<div class="card">
  <div class="view"><h2>走路</h2><div class="s">迈开/并腿交替 · 走到边转身</div>
    <div class="stage lane" id="lane"><img id="walkImg" style="height:210px"></div></div>
  <div class="ctls">
    <div class="ctl"><label>每帧停留</label><input type="range" id="wkMs" min="120" max="900" step="10" value="{wk['每帧毫秒']}"><b id="wkMsV"></b></div>
    <div class="ctl"><label>走多快</label><input type="range" id="wkPx" min="1" max="20" step="1" value="{wk['每帧位移px']}"><b id="wkPxV"></b></div>
    <div class="ctl"><label>重心起伏</label><input type="range" id="wkBob" min="0" max="18" step="1" value="{wk['重心起伏px']}"><b id="wkBobV"></b></div>
    <p class="tip">帧顺序是 1-2-4-5，GPT 原始的 3、6 打乱了节奏，已弃用。</p></div>
</div>

<div class="card">
  <div class="view"><h2>睡觉</h2><div class="s">4 帧 + 叠加代码呼吸</div>
    <div class="stage"><img id="slImg" style="height:150px"></div></div>
  <div class="ctls">
    <div class="ctl"><label>每帧停留</label><input type="range" id="slMs" min="300" max="3000" step="20" value="{sl['每帧毫秒']}"><b id="slMsV"></b></div>
    <div class="ctl"><label>呼吸周期</label><input type="range" id="slBr" min="2000" max="14000" step="100" value="{sl['叠加代码呼吸']['周期毫秒']}"><b id="slBrV"></b></div>
    <div class="ctl"><label>呼吸上浮</label><input type="range" id="slY" min="0" max="8" step="1" value="{sl['叠加代码呼吸']['上浮px']}"><b id="slYV"></b></div>
    <p class="tip">睡着的东西应该比醒着更慢。</p></div>
</div>

<div class="card">
  <div class="view"><h2>陪你一起工作</h2><div class="s">敲键盘 · 桌子已锁死</div>
    <div class="stage"><img id="woImg" style="height:260px"></div></div>
  <div class="ctls">
    <div class="ctl"><label>每帧停留</label><input type="range" id="woMs" min="150" max="1600" step="10" value="{wo['每帧毫秒']}"><b id="woMsV"></b></div>
    <p class="tip">太快像在赶 due，太慢像在发呆。它只是在旁边陪着。</p></div>
</div>

<div class="card">
  <div class="view"><h2>拎起来</h2><div class="s">在框里按住拖 · 松手会落回去</div>
    <div class="stage" id="liftStage"><div class="floor"></div><img id="liftImg"></div></div>
  <div class="ctls">
    <div class="ctl"><label>晃动幅度</label><input type="range" id="lfAmp" min="0" max="30" step="1" value="{lf['晃动幅度度']}"><b id="lfAmpV"></b></div>
    <div class="ctl"><label>回弹快慢</label><input type="range" id="lfK" min="0.01" max="0.30" step="0.01" value="{lf['回弹系数']}"><b id="lfKV"></b></div>
    <div class="ctl"><label>阻尼</label><input type="range" id="lfD" min="0.60" max="0.98" step="0.01" value="{lf['阻尼']}"><b id="lfDV"></b></div>
    <p class="tip">只有<b>按住</b>的时候才是被拎着的样子，松手落地就切回站立待机——
      拎起来那张图绝不会当静止状态显示。<br>
      摆动角度跟着你拖的速度走，不是循环播放的固定动画。</p></div>
</div>

<div id="out">
  <h2>当前参数</h2>
  <pre id="dump"></pre>
  <button onclick="copyOut()">复制参数</button><span id="msg">已复制，粘给 Claude 就行</span>
</div>

<script>
const idle={idle}, walk={walk}, sleep={sleep}, work={work}, liftSrc={lift};
const cyc=[walk[0],walk[1],walk[3],walk[4]];
const PIVX={lf['抓取点']['x比例']};                 // 抓取点在图上的横向比例
const $=i=>document.getElementById(i);
const V={{}};
const SL=[['brMs','ms'],['brY','px'],['blMs','ms/帧'],['blGap','ms'],
          ['wkMs','ms'],['wkPx','px/帧'],['wkBob','px'],
          ['slMs','ms'],['slBr','ms'],['slY','px'],['woMs','ms'],
          ['lfAmp','°'],['lfK',''],['lfD','']];

let styleEl=document.createElement('style'); document.head.appendChild(styleEl);

function sync(){{
  SL.forEach(([id,u])=>{{V[id]=+$(id).value;
    $(id+'V').textContent = (id==='blGap') ? (V[id]/1000).toFixed(1)+' 秒'
      : (id==='lfK'||id==='lfD') ? V[id].toFixed(2) : V[id]+' '+u;}});
  styleEl.textContent=
    `@keyframes brA{{0%,100%{{transform:translateY(0) scale(1,1)}}
       50%{{transform:translateY(-${{V.brY}}px) scale(.9986,1.014)}}}}
     @keyframes brB{{0%,100%{{transform:translateY(0) scale(1,1)}}
       50%{{transform:translateY(-${{V.slY}}px) scale(.9986,1.014)}}}}`;
  $('idleImg').style.animation=`brA ${{V.brMs}}ms ease-in-out infinite`;
  $('slImg').style.animation=`brB ${{V.slBr}}ms ease-in-out infinite`;
  restart(); dump();
}}
SL.forEach(([id])=>$(id).addEventListener('input',sync));

let tBlink,tWalk,tSleep,tWork,k=0,x=16,dir=1,pause=0,ks=0,ds=1,ko=0,doo=1;
function blink(){{
  [1,2,3,0].forEach((f,i)=>setTimeout(()=>$('idleImg').src=idle[f], i*V.blMs));
}}
function restart(){{
  [tBlink,tWalk,tSleep,tWork].forEach(t=>{{clearTimeout(t);clearInterval(t);}});
  const loop=()=>{{ blink(); tBlink=setTimeout(loop, V.blGap*(0.55+Math.random()*0.9)); }};
  tBlink=setTimeout(loop, 1000);

  tWalk=setInterval(()=>{{
    const bob=[0,-V.wkBob,0,-V.wkBob];
    if(pause>0){{pause--; return;}}
    $('walkImg').src=cyc[k]; x+=dir*V.wkPx;
    const W=$('lane').clientWidth-110;
    if(x>W||x<8){{dir*=-1; pause=Math.round(1500/V.wkMs);}}
    $('walkImg').style.left=x+'px';
    $('walkImg').style.transform=`translateY(${{bob[k]}}px) scaleX(${{dir}})`;
    k=(k+1)%4;
  }}, V.wkMs);

  tSleep=setInterval(()=>{{$('slImg').src=sleep[ks]; ks+=ds;
    if(ks>=sleep.length-1||ks<=0)ds*=-1;}}, V.slMs);
  tWork=setInterval(()=>{{$('woImg').src=work[ko]; ko+=doo;
    if(ko>=work.length-1||ko<=0)doo*=-1;}}, V.woMs);
}}

/* ---------- 拎起来：按住才是拎着的图，松手落回去变站立 ---------- */
const LIFT_H=310, IDLE_H=270;      // 两张图已按头宽对齐过尺度
const st=$('liftStage'), li=$('liftImg');
let held=false, ang=0, vel=0, px=0, lastX=0, dragV=0, falling=0;

function standing(){{                 // 站在地上，不动的样子
  li.src=idle[0]; li.style.height=IDLE_H+'px';
  li.style.transformOrigin='50% 100%'; li.style.transform='';
  li.style.left=(st.clientWidth/2-IDLE_H*254/557/2)+'px';
  li.style.top =(st.clientHeight-8-IDLE_H)+'px';
}}
function grab(e){{
  held=true; falling=0; st.classList.add('grab');
  li.src=liftSrc; li.style.height=LIFT_H+'px';
  li.style.transformOrigin=(PIVX*100)+'% 0%';
  lastX=e.offsetX; move(e);
}}
function move(e){{
  if(!held) return;
  const w=LIFT_H*228/640;
  px=e.offsetX;
  dragV=dragV*0.6+(px-lastX)*0.4; lastX=px;
  li.style.left=(px-PIVX*w)+'px';
  li.style.top =Math.max(4,e.offsetY)+'px';
}}
function drop(){{
  if(!held) return;
  held=false; dragV=0; st.classList.remove('grab');
  falling=performance.now();          // 开始下落
}}
st.addEventListener('mousedown',grab);
st.addEventListener('mousemove',move);
st.addEventListener('mouseup',drop);
st.addEventListener('mouseleave',drop);

function tick(){{
  // 目标角度：拖得越快，甩得越开；松手后目标是 0
  const tgt = held ? Math.max(-V.lfAmp, Math.min(V.lfAmp, -dragV*1.6)) : 0;
  vel = (vel + (tgt-ang)*V.lfK) * V.lfD;
  ang += vel;
  if(held){{
    li.style.transform=`rotate(${{ang.toFixed(2)}}deg)`;
    dragV*=0.86;                       // 手停下来，摆动自己收
  }} else if(falling){{
    const t=Math.min(1,(performance.now()-falling)/260);
    const w=LIFT_H*228/640;
    const y0=parseFloat(li.style.top)||0, yEnd=st.clientHeight-8-LIFT_H;
    li.style.top=(y0+(yEnd-y0)*(t*t))+'px';   // easeInQuad，越掉越快
    li.style.transform=`rotate(${{(ang*(1-t)).toFixed(2)}}deg)`;
    if(t>=1){{ falling=0; ang=vel=0; standing(); }}
  }}
  requestAnimationFrame(tick);
}}
window.__step=tick;                    // 方便无头验证

function dump(){{
  $('dump').textContent=
`待机：呼吸周期 ${{V.brMs}}ms，上浮 ${{V.brY}}px
眨眼：每帧 ${{V.blMs}}ms，平均 ${{(V.blGap/1000).toFixed(1)}} 秒一次
走路：每帧 ${{V.wkMs}}ms，速度 ${{V.wkPx}}px/帧，起伏 ${{V.wkBob}}px
睡觉：每帧 ${{V.slMs}}ms，呼吸周期 ${{V.slBr}}ms，上浮 ${{V.slY}}px
工作：每帧 ${{V.woMs}}ms
拎起来：幅度 ${{V.lfAmp}}°，回弹 ${{V.lfK.toFixed(2)}}，阻尼 ${{V.lfD.toFixed(2)}}`;
}}
function copyOut(){{
  navigator.clipboard.writeText($('dump').textContent).then(()=>{{
    $('msg').classList.add('on'); setTimeout(()=>$('msg').classList.remove('on'),2200);}});
}}
$('idleImg').src=idle[0]; $('slImg').src=sleep[0]; $('woImg').src=work[0]; $('walkImg').src=cyc[0];
sync(); standing(); tick();
</script></body></html>
"""

out = D / "调速台.html"
out.write_text(HTML, encoding="utf-8")
print(f"✓ 调速台.html  {out.stat().st_size/1048576:.1f} MB")
