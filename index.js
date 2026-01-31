require('dotenv').config();
const express = require('express');
// using global fetch available in Node 18+/24+ on Vercel

const app = express();
app.use(express.json({ limit: '10kb' })); // parse JSON requests

app.get('/health', (req, res) => res.status(200).send('OK'));

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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`;
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
      return res.status(502).json({ error: 'Upstream API error', status: response.status, body: bodyText });
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
