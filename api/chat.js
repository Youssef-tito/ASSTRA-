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
    const { prompt } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is missing' });
    }

    // Endpoint msahah bel-model gemini-1.5-flash
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt || 'Hello' }]
            }
          ]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      // Si gemini-1.5-flash fih mochkla, na3mlou fallback 3la gemini-2.0-flash
      const fallbackResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt || 'Hello' }] }]
          })
        }
      );
      const fallbackData = await fallbackResponse.json();
      if (!fallbackResponse.ok) {
        return res.status(response.status).json({ 
          error: data.error?.message || fallbackData.error?.message || 'Gemini API Error' 
        });
      }
      const replyFallback = fallbackData.candidates?.[0]?.content?.parts?.[0]?.text || 'Pas de réponse';
      return res.status(200).json({ reply: replyFallback });
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Pas de réponse';
    return res.status(200).json({ reply });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
