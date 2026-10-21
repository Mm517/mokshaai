import { createClient } from "jsr:@supabase/supabase-js@2";
const PER_IP_DAILY = 25, GLOBAL_DAILY = 500, MAX_PROMPT = 12000;
const MODELS: Record<string, string[]> = {
  gemini: ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"],
  groq: ["llama-3.3-70b-versatile", "openai/gpt-oss-120b"],
};
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const CODE_SYS = `You are an expert front-end developer and designer. Output ONE complete, self-contained HTML file (inline CSS and JS, no external libraries except Google Fonts). Respond with raw HTML only, no markdown fences, no explanations. Default to Arabic with dir="rtl" unless asked otherwise. Responsive, accessible, modern, with real-looking copy (no lorem ipsum). Use CSS gradients/SVG instead of remote images. Follow any design brief and integrations given. If spreadsheet data is provided, use it as the real content (products, prices, tables). When given existing HTML plus a change request, return the full updated HTML.`;
const DESIGN_SYS = `You are a senior UI/UX designer. From the request, write a SHORT design brief (max 250 words, Arabic or English): color palette with hex values, Google Fonts to use, layout of each section, tone of copy, key interactions. No code.`;
const ASK_SYS = `You help scope a website project. Read the conversation. If key information is still missing, ask at most 3 short numbered questions in Egyptian Arabic and nothing else. When you have enough, reply exactly: READY: followed by a complete, detailed website brief in Arabic (sections, content, style, colors, features).`;

async function llm(provider: string, model: string, system: string, user: string, max = 8000): Promise<string> {
  if (provider === "groq") {
    const key = Deno.env.get("GROQ_API_KEY");
    if (!key) throw new Error("مفتاح Groq لسه متحطش كـ Secret في Supabase (اسمه GROQ_API_KEY)");
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: max }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message ?? "Groq error");
    return d.choices?.[0]?.message?.content ?? "";
  }
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("مفتاح Gemini لسه متحطش كـ Secret في Supabase (اسمه GEMINI_API_KEY)");
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { maxOutputTokens: Math.max(max, 16000) } }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message ?? "Gemini error");
  return (d.candidates?.[0]?.content?.parts ?? []).filter((p: any) => !p.thought).map((p: any) => p.text ?? "").join("");
}
const stripFence = (h: string) => h.replace(/^```html\s*/i, "").replace(/```\s*$/, "").trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
    const since = new Date(Date.now() - 864e5).toISOString();
    const q = () => admin.from("sb_anon_usage").select("id", { count: "exact", head: true }).gte("created_at", since);
    const [mine, all] = await Promise.all([q().eq("ip", ip), q()]);
    if ((mine.count ?? 0) >= PER_IP_DAILY) return json({ error: `وصلت للحد اليومي (${PER_IP_DAILY} عملية). جرب بكرة.` }, 429);
    if ((all.count ?? 0) >= GLOBAL_DAILY) return json({ error: "الخدمة وصلت للحد اليومي، جرب بكرة." }, 429);
    const b = await req.json();
    const mode = b.mode ?? "generate";
    if (mode === "publish") {
      const h = String(b.html ?? "");
      if (!h || h.length > 400000) return json({ error: "الموقع كبير أو فاضي" }, 400);
      const slug = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
      const { error } = await admin.from("sb_published_pages").insert({ slug, html: h });
      if (error) throw new Error(error.message);
      await admin.from("sb_anon_usage").insert({ ip });
      return json({ slug });
    }
    const provider = b.provider === "groq" ? "groq" : "gemini";
    const model = MODELS[provider].includes(b.model) ? b.model : MODELS[provider][0];
    const prompt = String(b.prompt ?? "");
    if (!prompt && mode === "generate") return json({ error: "اكتب وصف الموقع الأول" }, 400);
    if (prompt.length > MAX_PROMPT) return json({ error: `الوصف طويل (${prompt.length} حرف). الحد ${MAX_PROMPT}.` }, 400);
    if (mode === "clarify") {
      const hist = (Array.isArray(b.history) ? b.history : []).slice(-12).map((m: any) => `${m.r === "a" ? "Assistant" : "User"}: ${String(m.t).slice(0, 4000)}`).join("\n");
      const force = (b.history?.length ?? 0) >= 6 ? "\n\nYou have asked enough. Reply with READY: and the brief now." : "";
      const text = await llm(provider, model, ASK_SYS, hist + force, 2000);
      await admin.from("sb_anon_usage").insert({ ip });
      return json({ text: text.trim() });
    }
    const base = b.currentHtml ? `الكود الحالي:\n${String(b.currentHtml).slice(0, 60000)}\n\nالتعديل المطلوب: ${prompt}` : prompt;
    let brief = "", user = base;
    if (b.agents && !b.currentHtml) {
      brief = (await llm(provider, model, DESIGN_SYS, prompt, 1500)).trim();
      user = `${base}\n\nDesign brief from the design agent:\n${brief}`;
    }
    const html = stripFence(await llm(provider, model, CODE_SYS, user));
    if (!html) return json({ error: "لم يتم توليد رد. جرب وصف تاني." }, 502);
    await admin.from("sb_anon_usage").insert({ ip });
    return json({ html, brief });
  } catch (e) {
    return json({ error: String((e as Error).message) }, 400);
  }
});
