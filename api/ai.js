module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée." });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "Configuration serveur manquante : GEMINI_API_KEY." });
    }

    const body = req.body || {};
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const image = typeof body.image === "string" ? body.image : null;
    const incomingContents = Array.isArray(body.contents) ? body.contents : [];

    const parts = [];

    if (prompt) {
      parts.push({ text: prompt });
    }

    if (image) {
      // Nettoyage et extraction du Base64 et MimeType
      const match = image.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
      if (match) {
        parts.push({
          inline_data: {
            mime_type: match[1],
            data: match[2].replace(/\s/g, "")
          }
        });
      }
    }

    if (parts.length === 0 && incomingContents.length === 0) {
      return res.status(400).json({ error: "Veuillez envoyer un message ou une image." });
    }

    // Traitement des contents
    let finalContents = [];
    if (incomingContents.length > 0) {
      finalContents = incomingContents;
    } else {
      finalContents = [{ role: "user", parts: parts }];
    }

    // Utilisation du modèle gemini-3.8-flash
    const model = "gemini-3.8-flash";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: finalContents,
        systemInstruction: {
          parts: [{
            text: "Tu es ASSTRA AI, un assistant intelligent. Analyse bien les images et réponds avec précision dans la langue de l'utilisateur (Français, Anglais, Arabe ou Tunisien)."
          }]
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || "Erreur de réponse du service IA."
      });
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Pas de réponse.";
    return res.status(200).json({ reply, model });

  } catch (error) {
    console.error("ASSTRA API error:", error);
    return res.status(500).json({ error: "Erreur interne du serveur." });
  }
};
