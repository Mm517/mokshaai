"use strict";
/* chat.js - قسم الشات: محادثة مع الذكاء الاصطناعي عن المشروع الحالي */

MK.chat = { msgs: [], busy: false };

function chatSave() {
  MK.lsSet("mk_chat", JSON.stringify(MK.chat.msgs.slice(-40).map((m) => ({ r: m.r, t: m.t, m: m.m || [] }))));
}

function copyText(t, ok) {
  const done = () => MK.say(ok || "تم النسخ", "ok");
  if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, () => MK.say("انسخ يدويًا", "err"));
  else MK.say("انسخ يدويًا", "err");
}

/* نص الرد: الفقرات بـ textContent بس، وكتل الكود لها زر نسخ */
function renderRich(box, text) {
  const parts = String(text).split(/```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g);
  for (let i = 0; i < parts.length;) {
    const before = parts[i++];
    if (before) before.split(/\n{2,}/).filter((s) => s.trim()).forEach((para) => {
      const p = document.createElement("p"); p.textContent = para.trim(); box.append(p);
    });
    if (i < parts.length) {
      const lang = parts[i++] || "code", code = (parts[i++] || "").replace(/\n$/, "");
      const wrap = document.createElement("div"); wrap.className = "cw";
      const head = document.createElement("div"); head.className = "cw__h";
      const l = document.createElement("span"); l.textContent = lang;
      const cp = document.createElement("button"); cp.type = "button"; cp.textContent = "نسخ الكود";
      cp.onclick = () => copyText(code, "تم نسخ الكود");
      head.append(l, cp);
      const pre = document.createElement("pre"), c = document.createElement("code");
      c.textContent = code; pre.append(c); wrap.append(head, pre); box.append(wrap);
    }
  }
}

MK.renderChat = function () {
  const log = $("chatlog");
  log.replaceChildren();
  $("cwelcome").hidden = MK.chat.msgs.length > 0;
  MK.chat.msgs.forEach((m) => {
    const b = document.createElement("div");
    b.className = "b " + m.r;
    if (m.r === "u") {
      b.textContent = m.t;
      (m.m || []).forEach((n) => {
        const chip = document.createElement("span"); chip.className = "fchip"; chip.textContent = n; b.append(chip);
      });
    } else {
      renderRich(b, m.t);
      const act = document.createElement("div"); act.className = "b__act";
      const cp = document.createElement("button"); cp.type = "button"; cp.textContent = "نسخ";
      cp.onclick = () => copyText(m.t);
      const ap = document.createElement("button"); ap.type = "button"; ap.textContent = "طبّق على الموقع";
      ap.onclick = () => MK.applyFromChat(m.t);
      act.append(cp, ap); b.append(act);
    }
    log.append(b);
  });
  if (MK.chat.busy) {
    const t = document.createElement("div"); t.className = "b a typing"; t.setAttribute("aria-label", "بيكتب");
    t.innerHTML = "<span></span><span></span><span></span>"; log.append(t);
  }
  log.scrollTop = log.scrollHeight;
};

MK.sendChat = async function (override) {
  if (MK.chat.busy) return;
  const ta = $("ctext");
  const text = (override ?? ta.value).trim();
  const media = MK.chatMedia.slice();
  if (!text && !media.length) return;
  const prior = MK.chat.msgs.map((m) => ({ r: m.r, t: m.t }));
  MK.chat.msgs.push({ r: "u", t: text || "شوف الصور المرفقة.", m: media.map((x) => x.name) });
  ta.value = ""; ta.style.height = "";
  MK.chatMedia = []; MK.renderChatMedia();
  MK.chat.busy = true; $("csend").disabled = true; MK.renderChat();
  try {
    const d = await MK.call({
      mode: "chat", prompt: text, history: prior, media: MK.forAI(media),
      files: MK.hasProject() ? MK.files : undefined, focus: MK.page,
    });
    MK.chat.msgs.push({ r: "a", t: MK.noEmoji(d.text || "") || "مفيش رد. جرب تاني." });
  } catch (e) {
    MK.chat.msgs.push({ r: "a", t: "حصل خطأ: " + MK.fe(e) });
  }
  MK.chat.busy = false; $("csend").disabled = false;
  chatSave(); MK.renderChat();
};

MK.applyFromChat = function (text) {
  MK.switchSide("build");
  const body = text.slice(0, 6000);
  if (MK.hasProject()) {
    $("prompt").value = "نفّذ التعديلات دي على الموقع:\n" + body;
    $("go").click();
  } else {
    $("prompt").value = body;
    MK.say("الوصف اتنقل لقسم البناء. اضغط «إنشاء الموقع».", "ok");
    $("prompt").focus();
  }
};

MK.initChat = function () {
  try { MK.chat.msgs = JSON.parse(MK.lsGet("mk_chat", "[]")); } catch (e) { MK.chat.msgs = []; }
  MK.bindPicker($("cfile"), $("cform"), "chat", MK.say);
  $("cform").onsubmit = (e) => { e.preventDefault(); MK.sendChat(); };
  $("ctext").onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); MK.sendChat(); } };
  $("ctext").oninput = (e) => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px"; };
  $("cclear").onclick = () => { MK.chat.msgs = []; chatSave(); MK.renderChat(); };
  document.querySelectorAll("[data-ask]").forEach((b) => { b.onclick = () => MK.sendChat(b.dataset.ask); });
  MK.renderChat();
};
