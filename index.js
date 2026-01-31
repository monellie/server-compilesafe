require('dotenv').config();
const express = require('express');
// using global fetch available in Node 18+/24+ on Vercel

const app = express();
app.use(express.json({ limit: '10kb' })); // parse JSON requests

app.get('/health', (req, res) => res.status(200).send('OK'));

// Admin: list detected/candidate models and optional discovery
let cachedModel = process.env.GEMINI_MODEL || null;
const candidateModels = (process.env.GEMINI_MODEL_CANDIDATES || 'gemini-2.5,gemini-1.5-pro,text-bison-001').split(',').map(s => s.trim()).filter(Boolean);

async function probeModel(model) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'Model availability check' }] }] })
    });
    return resp.ok;
  } catch (e) {
    console.error('probeModel error for', model, e && e.message);
    return false;
  }
}

async function listAvailableModels() {
  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
    if (!resp.ok) return null;
    const json = await resp.json();
    return json.models || null;
  } catch (e) {
    return null;
  }
}

async function detectModel() {
  if (cachedModel) return cachedModel;
  if (process.env.GEMINI_MODEL) {
    cachedModel = process.env.GEMINI_MODEL;
    return cachedModel;
  }

  for (const m of candidateModels) {
    if (await probeModel(m)) {
      cachedModel = m;
      return m;
    }
  }

  // Try listing models and probing a few
  const models = await listAvailableModels();
  if (Array.isArray(models)) {
    for (const mod of models) {
      const name = mod.name || mod.model || (typeof mod === 'string' ? mod : null);
      if (name && await probeModel(name)) {
        cachedModel = name;
        return name;
      }
    }
  }

  return null;
}

app.get('/models', async (req, res) => {
  const avail = await listAvailableModels();
  res.json({ detected: cachedModel, candidates: candidateModels, available: avail });
});

// The endpoint your extension will call
app.post('/api/explain', async (req, res) => {
  const { error, message } = req.body || {};
  const text = error || message;

  if (!text) return res.status(400).json({ error: 'Missing error text (send `message` or `error` in JSON body)' });

  try {
    if (!process.env.GEMINI_API_KEY) {
      console.error('Missing GEMINI_API_KEY');
      return res.status(500).json({ error: 'Server misconfigured: missing GEMINI_API_KEY' });
    }

    const model = await detectModel();

    if (!model) {
      const explanation = `(Server) No compatible model found. Please set GEMINI_MODEL manually or check available models at /models`;
      return res.status(200).json({ explanation });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `Explain this error clearly:\n${text}` }]
        }]
      })
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      console.error('Gemini API returned non-2xx', response.status, bodyText);
      const explanation = `(Server) Upstream API error ${response.status}: ${bodyText}`;
      return res.status(200).json({ explanation, upstreamError: { status: response.status, body: bodyText } });
    }

    const data = await response.json();

    res.json({
      explanation: data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response',
      input: text
    });

  } catch (err) {
    console.error('explain handler error:', err);
    res.status(500).json({ error: 'Failed to call Gemini', details: String(err.message || err) });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Server running on http://localhost:${process.env.PORT || 3000}`);
});
