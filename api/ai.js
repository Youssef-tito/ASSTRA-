module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({
      error: "Méthode non autorisée."
    });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "Configuration serveur manquante : GEMINI_API_KEY."
      });
    }

    const body = req.body || {};

    const prompt =
      typeof body.prompt === "string"
        ? body.prompt.trim()
        : "";

    const image =
      typeof body.image === "string"
        ? body.image
        : null;

    const incomingContents =
      Array.isArray(body.contents)
        ? body.contents
        : [];

    if (prompt.length > 20000) {
      return res.status(400).json({
        error: "Le message est trop long."
      });
    }

    /*
     * Validate the optional image.
     * Only JPEG, PNG and WEBP are accepted.
     */
    let imagePart = null;

    if (image) {
      const match = image.match(
        /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/
      );

      if (!match) {
        return res.status(400).json({
          error: "Format d'image invalide. Utilisez JPG, PNG ou WEBP."
        });
      }

      const mimeType = match[1];
      const base64 = match[2].replace(/\s/g, "");

      const approximateBytes =
        Math.floor(base64.length * 3 / 4);

      if (approximateBytes > 5 * 1024 * 1024) {
        return res.status(413).json({
          error: "Image trop volumineuse. Limite : 5 Mo."
        });
      }

      imagePart = {
        inline_data: {
          mime_type: mimeType,
          data: base64
        }
      };
    }

    if (!prompt && !imagePart) {
      return res.status(400).json({
        error: "Veuillez envoyer un message ou une image."
      });
    }

    /*
     * Keep a limited conversation history.
     * Never trust arbitrary client-supplied objects.
     */
    const contents = [];

    for (const item of incomingContents.slice(-20)) {
      if (!item || !["user", "model"].includes(item.role)) {
        continue;
      }

      if (!Array.isArray(item.parts)) {
        continue;
      }

      const safeParts = [];

      for (const part of item.parts.slice(0, 4)) {
        if (
          part &&
          typeof part.text === "string" &&
          part.text.length <= 20000
        ) {
          safeParts.push({
            text: part.text
          });
        }
      }

      if (safeParts.length > 0) {
        contents.push({
          role: item.role,
          parts: safeParts
        });
      }
    }

    /*
     * IMPORTANT:
     * The current user message must be appended
     * after the previous conversation history.
     */
    const currentParts = [];

    if (prompt) {
      currentParts.push({ text: prompt });
    }

    if (imagePart) {
      currentParts.push(imagePart);
    }

    contents.push({
      role: "user",
      parts: currentParts
    });

    /*
     * Gemini API configuration.
     * Keep GEMINI_API_KEY on the server only.
     */
    const model = "gemini-1.5-flash";

    const apiUrl =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      model +
      ":generateContent";

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 55000);

    let response;

    try {
      response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        signal: controller.signal,
        body: JSON.stringify({
          contents,
          systemInstruction: {
            parts: [{
              text:
                "Tu es ASSTRA AI, un assistant intelligent, " +
                "utile, clair et professionnel. " +
                "Réponds dans la langue de l'utilisateur : " +
                "français, anglais, arabe ou tunisien. " +
                "Adapte tes explications au niveau de la personne. " +
                "Pour le code, donne des exemples précis et bien organisés. " +
                "Si une image est fournie, analyse-la avec attention. " +
                "N'invente pas des détails que tu ne peux pas vérifier."
            }]
          },
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096
          }
        })
      });
    } finally {
      clearTimeout(timeout);
    }

    let data;

    try {
      data = await response.json();
    } catch {
      return res.status(502).json({
        error: "Réponse invalide du service Gemini."
      });
    }

    if (!response.ok) {
      console.error(
        "Gemini API error:",
        response.status,
        data.error?.message || "Unknown error"
      );

      const status = [400, 401, 403, 429].includes(response.status)
        ? response.status
        : 502;

      let message = "Erreur de réponse du service IA.";

      if (response.status === 400) {
        message = "Requête invalide. Vérifiez le message ou l'image.";
      } else if (
        response.status === 401 ||
        response.status === 403
      ) {
        message = "Clé API invalide ou accès Gemini non autorisé.";
      } else if (response.status === 429) {
        message = "Limite d'utilisation Gemini atteinte. Réessayez plus tard.";
      }

      return res.status(status).json({
        error: message
      });
    }

    const candidate = data.candidates?.[0];

    const reply = candidate?.content?.parts
      ?.filter(part => typeof part.text === "string")
      .map(part => part.text)
      .join("\n")
      .trim();

    if (!reply) {
      console.error(
        "Gemini returned no text:",
        candidate?.finishReason || "unknown"
      );

      return res.status(502).json({
        error: "Gemini n'a pas généré de réponse. Réessayez."
      });
    }

    return res.status(200).json({
      reply,
      model
    });

  } catch (error) {
    console.error(
      "ASSTRA API error:",
      error.name || "Error",
      error.message || ""
    );

    if (error.name === "AbortError") {
      return res.status(504).json({
        error: "Le délai de réponse a expiré. Réessayez."
      });
    }

    return res.status(500).json({
      error: "Erreur interne du serveur."
    });
  }
};
