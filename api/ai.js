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

    // قائمة الموديلات الذكية التي تدعم كافة لغات العالم
    const models = ['gemini-3.8-flash', 'gemini-1.5-flash', 'gemini-2.0-flash'];
    let response = null;
    let data = null;

    for (const model of models) {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `You are ASSTRA AI, an advanced, professional, and multilingual artificial intelligence assistant. 
                    - You support and fluently understand EVERY language in the world (Arabic, French, English, Spanish, Chinese, Japanese, Tunisian Derja, etc.).
                    - Always reply back in the exact same language used by the user in their message.
                    - Format your response cleanly using Markdown (bold text, bullet points, structured headings) for a premium reading experience.

                    User Message: ${prompt || 'Hello'}`
                  }
                ]
              }
            ]
          })
        }
      );

      data = await response.json();
      if (response.ok) {
        break; // إذا نجح الطلب، اخرج من الحلقة
      }
    }

    if (!response || !response.ok) {
      return res.status(500).json({ error: data?.error?.message || 'All Gemini models are busy. Please try again.' });
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Pas de réponse';
    return res.status(200).json({ reply });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
