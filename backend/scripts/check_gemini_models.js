'use strict';
require('dotenv').config({ path: 'E:/unmute2/backend/.env' });

async function main() {
  const keys = (process.env.GEMINI_API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
  const models = [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash-lite',
    'gemma-4-31b-it',
  ];

  await Promise.all(models.map(async (m, idx) => {
    const key = keys[idx % keys.length];
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Think step by step about NVDAUSDT at $176.89 (+5.5% 24h) and output JSON {"score":9,"thesis":" Strong breakout"}' }] }],
          generationConfig: {
            maxOutputTokens: 512,
            thinkingConfig: { includeThoughts: true, thinkingBudget: 256 },
          },
        }),
      });
      const d = await r.json();
      const parts = d.candidates?.[0]?.content?.parts || [];
      const thoughtPart = parts.find(p => p.thought);
      const textPart = parts.find(p => !p.thought);
      console.log(`[${m}] HTTP ${r.status} | ThoughtLen=${thoughtPart?.text?.length || 0} | Text=${(textPart?.text || d.error?.message || '').slice(0, 100).replace(/\n/g, ' ')}`);
    } catch (e) {
      console.log(`[${m}] ERR:`, e.message);
    }
  }));
}
main().catch(console.error);
