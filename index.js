require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch'); // install node-fetch if needed

const app = express();
app.use(express.json({ limit: '10kb' })); // parse JSON requests

// The endpoint your extension will call
app.post('/api/explain', async (req, res) => {
  const { error } = req.body;

  if (!error) return res.status(400).json({ error: 'Missing error text' });

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `Explain this error clearly:\n${error}` }]
          }]
        })
      }
    );

    const data = await response.json();

    res.json({
      explanation: data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response',
      error
    });

  } catch (err) {
    res.status(500).json({ error: 'Failed to call Gemini', details: err.message });
  }
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
