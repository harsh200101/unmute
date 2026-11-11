'use strict';
require('dotenv').config({ path: 'E:/unmute2/backend/.env' });

async function main() {
  const keys = (process.env.GEMINI_API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
  const key = keys[0];
  const modelsToTest = ['gemini-2.5-flash', 'gemini-3-flash-preview'];

  for (const model of modelsToTest) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Analyze NVDAUSDT at $176.89 (+5.5% 24h, 46x bid/ask imbalance) while US stock market is open. Respond with JSON {"score": 9, "thesis": "..."}' }] }],
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.2,
            thinkingConfig: {
              includeThoughts: true,
              thinkingBudget: 512,
            },
          },
        }),
      }
    );
    const data = await res.json();
    console.log(`=== Model: ${model} (HTTP ${res.status}) ===`);
    console.log('Usage:', JSON.stringify(data.usageMetadata));
    const parts = data.candidates?.[0]?.content?.parts || [];
    parts.forEach((p, idx) => {
      console.log(`Part #${idx} (thought=${Boolean(p.thought)}):`, (p.text || '').slice(0, 400));
    });
    if (data.error) console.log('Error:', JSON.stringify(data.error));
  }
}
main().catch(console.error);
