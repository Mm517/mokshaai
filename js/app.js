"use strict";
/* app.js - الواجهة الرئيسية: البناء، التبويبات، المحرر، الفلتر، النشر */

const TYPES = ["متجر إلكتروني", "عيادة", "بورتفوليو", "شركة", "مطعم", "مدونة", "صفحة هبوط", "موقع بفيديو", "موقع ثلاثي الأبعاد"];
const PROV = {
  grok: [["grok-4.7", "Grok 4.7"], ["grok-4.6", "Grok 4.6"], ["grok-4.5", "Grok 4.5"]],
  gemini: [["gemini-3.8-flash", "Gemini 3.8 Flash"], ["gemini-3.6-flash", "Gemini 3.6 Flash"], ["gemini-3.5-flash-lite", "Gemini 3.5 Flash-Lite"]],
};
const MAX_TEXT = 9000;

let type = TYPES[0], busy = false, askChat = [], loadTimer = null;

/* ---------- تبويبات الشريط الجانبي (بناء / شات) ---------- */
MK.switchSide = function (t) {
  const build = t === "build";
  $("sBuild").setAttribute("aria-pressed", build);
  $("sChat").setAttribute("aria-pressed", !build);
  $("pBuild").hidden = !build;
  $("pChat").hidden = build;
  if (!build) { MK.renderChat(); setTimeout(() => $("ctext").focus(), 30); }
};

/* ---------- تبويبات المنطقة الرئيسية (معاينة / ملفات / تعديل) ---------- */
function setTab(t) {
  MK.flushOps();
  $("tPrev").setAttribute("aria-pressed", t === "p");
  $("tFiles").setAttribute("aria-pressed", t === "f");
  $("tEdit").setAttribute("aria-pressed", t === "e");
  MK.editing = t === "e";
  $("ep").hidden = true;
  const showFiles = t === "f";
  $("fview").hidden = !showFiles;
  $("frame").hidden = showFiles || !MK.hasProject();
  if (showFiles) MK.renderFiles();
  else MK.render();
}

/* ---------- اللودر ---------- */
const LINES = ['<header class="nav">', "  <nav>...</nav>", "--c-accent: #2f45d4;", ".hero{display:grid;gap:24px}", '<section id="products">', "@media(max-width:768px){...}", "const items = [...]", "footer{padding:32px}", "css/tokens.css", "js/main.js"];
function loader(on, steps) {
  $("ld").hidden = !on;
  clearInterval(loadTimer);
  if (!on) return;
  $("steps").innerHTML = steps.map((x) => "<li>" + MK.esc(x) + "</li>").join("");
  let n = 0;
  loadTimer = setInterval(() => {
    n++;
    $("tick").innerHTML = Array.from({ length: 6 }, (_, k) => MK.esc(LINES[(n + k * 3) % LINES.length])).join("<br>");
  }, 350);
}
function loaderStep(i) {
  [...$("steps").children].forEach((li, k) => { li.className = k < i ? "done" : k === i ? "on" : ""; });
}

/* ---------- كتابة الملفات قدام المستخدم ---------- */
async function reveal(paths) {
  const list = paths.slice(0, 10);
  $("tPrev").setAttribute("aria-pressed", "false"); $("tFiles").setAttribute("aria-pressed", "true"); $("tEdit").setAttribute("aria-pressed", "false");
  MK.editing = false; $("fview").hidden = false; $("frame").hidden = true; $("empty").hidden = true;
  const per = Math.max(120, Math.min(450, 3200 / Math.max(list.length, 1)));
  for (const p of list) {
    MK.sel = p; MK.renderFiles();
    const full = MK.files[p] || "", code = $("code");
    const steps = 14, chunk = Math.ceil(full.length / steps);
    for (let i = 1; i <= steps; i++) {
      code.value = full.slice(0, chunk * i); code.scrollTop = 1e9;
      await new Promise((r) => setTimeout(r, per / steps));
    }
    code.value = full;
  }
}

/* ---------- تصفية الكلام (محلية) ---------- */
const DEF_R = "عايز => أريد\nعاوز => أريد\nاعمللي => أنشئ لي\nاعملي => أنشئ لي\nموقه => موقع\nالموقه => الموقع\nويبسايت => موقع\nمتجر الكترونى => متجر إلكتروني\nشغال => يعمل\nدوس => اضغط\nهات => أضف";
const DEF_M = "يعني\nبقى\nيا باشا";
const SEP = "[\\s،.,!?؟؛:()\"']";
function clean(t) {
  t = MK.noEmoji(t).replace(/([ء-ي])\1{2,}/g, "$1").replace(/([!?؟.,،])\1{1,}/g, "$1").replace(/[ \t]{2,}/g, " ");
  $("frules").value.split("\n").forEach((l) => {
    const i = l.indexOf("=>");
    if (i < 1) return;
    const a = l.slice(0, i).trim(), b = l.slice(i + 2).trim();
    if (a) t = t.replace(new RegExp("(^|" + SEP + ")" + MK.escRe(a) + "(?=$|" + SEP + ")", "g"), (m, p) => p + b);
  });
  $("frm").value.split("\n").map((x) => x.trim()).filter(Boolean).forEach((w) => {
    t = t.replace(new RegExp("(^|" + SEP + ")" + MK.escRe(w) + "(?=$|" + SEP + ")", "g"), (m, p) => p);
  });
  return t.replace(/[ \t]{2,}/g, " ").trim();
}

/* ---------- بناء الطلب الأول ---------- */
let xl = "";
function build(text) {
  let p = "أنشئ موقع من نوع: " + type + ". الاسم: " + ($("name").value || "بدون اسم") + ". الألوان: أساسي " + $("c1").value + " وثانوي " + $("c2").value + ". الوصف: " + text;
  const ig = [];
  if ($("i_wa").checked) ig.push("زر واتساب عائم برقم " + ($("wa").value || "غير محدد") + " (رابط wa.me)");
  if ($("i_map").checked) ig.push("قسم موقع بخريطة Google Maps (iframe embed) للعنوان: " + ($("addr").value || "غير محدد"));
  if ($("i_form").checked) ig.push("نموذج تواصل (الاسم، الموبايل، الرسالة) مع رسالة شكر بعد الإرسال");
  if ($("i_soc").checked) ig.push("روابط سوشيال ميديا في الفوتر");
  if (ig.length) p += "\nالتكاملات المطلوبة: " + ig.join(" - ");
  if (xl) p += "\nبيانات من ملف إكسل (استخدمها كمحتوى حقيقي: منتجات/أسعار/جداول):\n" + xl;
  return p;
}

/* ---------- التوليد (إنشاء أو تعديل) ---------- */
const sentIds = new Set();
async function run(text, first) {
  const agents = $("agents").checked;
  const steps = first
    ? (agents ? ["فهم الفكرة والوسائط", "وكيل التصميم: الألوان والتخطيط", "وكيل الكود: كتابة الملفات", "وكيل المراجعة: فحص وتحسين"] : ["فهم الفكرة والوسائط", "كتابة الملفات"])
    : ["قراءة المشروع", "تطبيق التعديل وكتابة الملفات"];
  let i = 0;
  loader(true, steps); loaderStep(i++);
  $("frame").hidden = true; $("fview").hidden = true;
  const items = Object.values(MK.assets);
  const fresh = first ? items : items.filter((it) => !sentIds.has(it.id));
  const media = MK.forAI(fresh);
  const man = MK.manifest();
  const prompt = text + (man ? "\n\nUploaded media manifest:\n" + man : "");
  const assets = MK.assetList();
  try {
    let brief = "";
    if (first && agents) { loaderStep(i++); brief = (await MK.call({ mode: "design", prompt, media })).brief || ""; }
    loaderStep(i++);
    const d = await MK.call({ mode: "generate", prompt, brief, media, assets, files: first ? undefined : MK.files, focus: MK.page });
    fresh.forEach((it) => sentIds.add(it.id));
    MK.merge(d);
    const changed = new Set((d.files || []).map((f) => f.path));
    if (first && agents) {
      loaderStep(i++);
      try {
        const r = await MK.call({ mode: "review", prompt, brief, files: MK.files, assets, issues: d.issues });
        if (r.changed) { MK.merge(r); (r.files || []).forEach((f) => changed.add(f.path)); }
      } catch (e) { MK.say("المراجعة اتخطت (" + MK.fe(e) + ") لكن الموقع جاهز.", "err"); }
    }
    loader(false);
    if (first) { MK.page = MK.pages()[0] || "index.html"; }
    await reveal([...changed].filter((p) => MK.files[p] != null));
    setTab("p");
    MK.saveProject();
    $("go").textContent = "تطبيق التعديل";
    $("prompt").value = ""; $("prompt").placeholder = "اكتب أي تعديل... أو جرّب «تعديل بإيدك» فوق";
    askChat = []; $("chat").innerHTML = ""; $("chat").hidden = true;
    MK.say("تم: " + Object.keys(MK.files).length + " ملف. عدّل بالكتابة أو بالشات، وبعدين حمّل ZIP أو انشر.", "ok");
  } catch (e) {
    loader(false);
    MK.say("فشل: " + MK.fe(e), "err");
    setTab("p");
  }
}

function bubble(r, t) {
  $("chat").hidden = false;
  const d = document.createElement("div");
  d.className = "b " + r; d.textContent = t;
  $("chat").appendChild(d); $("chat").scrollTop = 1e9;
}

async function onGo() {
  if (busy) return;
  let text = $("prompt").value.trim();
  if (text && $("fauto").checked) { text = clean(text); $("prompt").value = text; }
  if (!text) { MK.say("اكتب الأول.", "err"); return; }
  if (text.length > MAX_TEXT) { MK.say("الوصف طويل (" + text.length + " حرف). الحد " + MAX_TEXT + ".", "err"); return; }
  busy = true; $("go").disabled = true;
  const first = !MK.hasProject();
  if (first) MK.pid = null;
  try {
    if (first && $("ask").checked) {
      askChat.push({ r: "u", t: askChat.length ? text : build(text) });
      bubble("u", text); $("prompt").value = ""; MK.say("بفكر في أسئلة...");
      const d = await MK.call({ mode: "clarify", history: askChat, media: askChat.length === 1 ? MK.forAI(Object.values(MK.assets)) : undefined });
      if (/^READY:/i.test(d.text)) {
        bubble("a", "تمام، فهمت الفكرة. بنبني دلوقتي.");
        const brief = d.text.replace(/^READY:\s*/i, "");
        askChat = [];
        await run(brief + (xl ? "\nبيانات إكسل:\n" + xl : ""), true);
      } else {
        askChat.push({ r: "a", t: d.text }); bubble("a", d.text);
        $("prompt").placeholder = "جاوب هنا..."; MK.say("جاوب على الأسئلة وأكمل.", "ok");
      }
    } else {
      await run(first ? build(text) : text, first);
    }
  } catch (e) { MK.say("فشل: " + MK.fe(e), "err"); }
  busy = false; $("go").disabled = false;
}

/* ---------- تهيئة ---------- */
function init() {
  // نوع الموقع
  $("types").innerHTML = TYPES.map((t, i) => '<button class="chip" type="button" aria-pressed="' + (i === 0) + '">' + t + "</button>").join("");
  $("types").onclick = (e) => {
    if (!e.target.classList.contains("chip")) return;
    type = e.target.textContent;
    [...$("types").children].forEach((c) => c.setAttribute("aria-pressed", c === e.target));
  };

  // المزود والنموذج
  const fillModels = () => { $("model").innerHTML = PROV[$("prov").value].map((m) => '<option value="' + m[0] + '">' + m[1] + "</option>").join(""); };
  const savedProv = MK.lsGet("mk_prov", "grok");
  $("prov").value = PROV[savedProv] ? savedProv : "grok";
  fillModels();
  const savedModel = MK.lsGet("mk_model", "");
  if ([...$("model").options].some((o) => o.value === savedModel)) $("model").value = savedModel;
  $("prov").onchange = () => { MK.lsSet("mk_prov", $("prov").value); fillModels(); };
  $("model").onchange = () => MK.lsSet("mk_model", $("model").value);

  $("sBuild").onclick = () => MK.switchSide("build");
  $("sChat").onclick = () => MK.switchSide("chat");

  $("i_wa").onchange = () => { $("wa").hidden = !$("i_wa").checked; };
  $("i_map").onchange = () => { $("addr").hidden = !$("i_map").checked; };

  // إكسل
  $("xl").onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const wb = XLSX.read(await f.arrayBuffer());
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
      xl = csv.slice(0, 5000);
      $("xlm").textContent = "اتقرا: " + f.name + " (" + csv.split("\n").filter(Boolean).length + " صف)";
    } catch (err) { xl = ""; $("xlm").textContent = "تعذّرت قراءة الملف"; }
  };

  // وسائط البناء
  MK.bindPicker($("mfile"), $("mdrop"), "assets", MK.say);

  // الفلتر
  $("frules").value = MK.lsGet("mk_r", DEF_R); $("frm").value = MK.lsGet("mk_m", DEF_M);
  $("frules").oninput = () => MK.lsSet("mk_r", $("frules").value);
  $("frm").oninput = () => MK.lsSet("mk_m", $("frm").value);
  $("frst").onclick = () => { $("frules").value = DEF_R; $("frm").value = DEF_M; MK.lsSet("mk_r", DEF_R); MK.lsSet("mk_m", DEF_M); };
  $("fnow").onclick = () => { $("prompt").value = clean($("prompt").value); MK.say("تمت التصفية. راجع الوصف وعدّل لو عايز.", "ok"); };

  $("go").onclick = onGo;
  $("newp").onclick = () => {
    if (busy) return;
    MK.flushOps();
    MK.files = {}; MK.page = "index.html"; MK.sel = "index.html"; MK.pid = null;
    Object.values(MK.assets).forEach((it) => it.objUrl && URL.revokeObjectURL(it.objUrl));
    MK.assets = {}; sentIds.clear(); MK.renderAssets();
    $("prompt").value = ""; $("go").textContent = "إنشاء الموقع"; $("name").value = "";
    askChat = []; $("chat").innerHTML = ""; $("chat").hidden = true;
    setTab("p"); MK.say("مشروع جديد. اكتب فكرتك.", "ok");
  };

  // التبويبات
  $("tPrev").onclick = () => setTab("p");
  $("tFiles").onclick = () => setTab("f");
  $("tEdit").onclick = () => {
    if (!MK.hasProject()) { MK.say("اعمل موقع الأول.", "err"); return; }
    setTab("e"); MK.say("اضغط على أي عنصر في الموقع وعدّله", "ok");
  };
  $("pagesel").onchange = (e) => { MK.flushOps(); MK.page = e.target.value; MK.sel = MK.page; if (!$("fview").hidden) MK.renderFiles(); else MK.render(); };

  // محرر الملفات
  $("code").oninput = () => { if (MK.files[MK.sel] != null) MK.files[MK.sel] = $("code").value; };
  $("fnew").onclick = () => {
    const p = (prompt("اسم الملف الجديد (مثال: css/extra.css)") || "").trim().replace(/^\/+/, "");
    if (!p) return;
    if (!/^[A-Za-z0-9_\-./]+\.(html|css|js|json|svg|txt|md)$/i.test(p) || p.includes("..")) { MK.say("اسم ملف غير صالح.", "err"); return; }
    if (MK.files[p] == null) MK.files[p] = "";
    MK.sel = p; MK.renderFiles();
  };
  $("fdel").onclick = () => {
    if (MK.files[MK.sel] == null || MK.sel === "index.html") { MK.say("مينفعش تحذف الملف ده.", "err"); return; }
    if (!confirm("حذف " + MK.sel + " ؟")) return;
    delete MK.files[MK.sel]; MK.sel = MK.page; MK.renderFiles();
  };

  // أدوات الشريط العلوي
  document.querySelectorAll("[data-w]").forEach((b) => { b.onclick = () => { $("frame").style.width = b.dataset.w; }; });
  $("copy").onclick = async () => {
    const f = !$("fview").hidden ? MK.sel : MK.page;
    if (MK.files[f] == null) return;
    try { await navigator.clipboard.writeText(MK.files[f]); MK.say("تم نسخ " + f, "ok"); } catch (e) { MK.say("انسخ من تبويب الملفات", "err"); }
  };
  $("zip").onclick = MK.downloadZip;
  $("pub").onclick = async () => {
    if (!MK.hasProject()) { MK.say("اعمل موقع الأول.", "err"); return; }
    $("pub").disabled = true; MK.say("جاري النشر...");
    try {
      const html = MK.publishHtml();
      if (html.length > 3000000) throw new Error("الموقع كبير على النشر (" + MK.kb(html.length) + "). شيل صور كبيرة أو حمّله ZIP.");
      const d = await MK.call({ mode: "publish", html });
      const url = location.origin + location.pathname + "?s=" + d.slug;
      $("msg").className = "ok";
      $("msg").innerHTML = "";
      const a = document.createElement("a");
      a.href = url; a.target = "_blank"; a.rel = "noopener"; a.dir = "ltr"; a.textContent = url;
      $("msg").append("تم النشر: ", a);
      if (MK.skippedVideos) $("msg").append(" (الفيديوهات مش بتتنشر أونلاين، حمّل ZIP لو الموقع فيه فيديو)");
      try { await navigator.clipboard.writeText(url); } catch (e) { /* مش مهم */ }
    } catch (e) { MK.say("فشل النشر: " + MK.fe(e), "err"); }
    $("pub").disabled = false;
  };

  // المحرر البصري
  const hex = (c) => {
    const m = c.match(/[\d.]+/g);
    return m && m.length >= 3 && m[3] !== "0" ? "#" + m.slice(0, 3).map((x) => (+x | 0).toString(16).padStart(2, "0")).join("") : "#ffffff";
  };
  const send = (m) => { const w = $("frame").contentWindow; if (w) w.postMessage(m, "*"); };
  addEventListener("message", (e) => {
    if (e.source !== $("frame").contentWindow || !e.data) return;
    const d = e.data;
    if (d.t === "sel") {
      $("ep").hidden = false; $("etag").textContent = String(d.tag).toLowerCase();
      $("ec").value = hex(d.color); $("eb").value = hex(d.bg); $("es").value = d.size || 16; $("ei").hidden = !d.img;
    } else if (d.t === "op") {
      MK.queueOp(d.op);
    } else if (d.t === "nav") {
      const p = MK.resolve(MK.page, d.href);
      if (MK.files[p] != null) { MK.page = p; MK.sel = p; MK.render(); } else MK.say("الصفحة مش موجودة في المشروع: " + p, "err");
    }
  });
  $("ec").oninput = (e) => send({ c: "style", p: "color", v: e.target.value });
  $("eb").oninput = (e) => send({ c: "style", p: "backgroundColor", v: e.target.value });
  $("es").oninput = (e) => send({ c: "style", p: "fontSize", v: e.target.value + "px" });
  $("ei").onchange = (e) => send({ c: "src", v: e.target.value });
  $("ed").onclick = () => { send({ c: "del" }); $("ep").hidden = true; };

  $("frame").addEventListener("load", MK.sendVideos);
  MK.initChat();
  MK.renderAssets();
  MK.renderProjects();
  MK.render();
}

if (!MK.viewer) document.addEventListener("DOMContentLoaded", init);
