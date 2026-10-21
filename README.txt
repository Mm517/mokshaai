Mokasha AI
1) Supabase > Edge Functions > Secrets: GEMINI_API_KEY و GROQ_API_KEY
2) الـ Function: supabase/functions/generate-site/index.ts  (verify_jwt = false)
   النشر: supabase functions deploy generate-site --no-verify-jwt
3) الجداول: supabase/setup.sql (متطبقة بالفعل على مشروع nosoq)
4) index.html: ارفعه على Vercel أو أي استضافة (مش معاينة جوه محرر)
الحدود: 25 عملية/جهاز/يوم، 500 للموقع كله (أول ملف الـ Function)
التصفية: جوه الصفحة، قواعدك بتتحفظ في متصفحك
