export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt, image } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is missing' });
    }

    const parts = [];
    if (prompt) {
      parts.push({ text: prompt });
    }

    if (image) {
      const base64Data = image.replace(/^data:image\/[a-z]+;base64,/, '');
      parts.push({
        inline_data: {
          mime_type: "image/jpeg",
          data: base64Data
        }
      });
    }

    if (parts.length === 0) {
      return res.status(400).json({ error: 'Prompt or image is required' });
    }

    // استخدام gemini-2.5-flash مع تفعيل البحث في الويب (Google Search Grounding)
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: parts }],
        tools: [{ "google_search": {} }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: data.error?.message || 'Gemini API Error' 
      });
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Pas de réponse';
    return res.status(200).json({ reply });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
