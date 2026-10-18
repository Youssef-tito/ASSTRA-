module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  // OPTIONS
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    return res.status(204).end();
  }

  // POST only
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return res.status(405).json({
      error: "Méthode non autorisée."
    });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing.");

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

    const incomingContents = Array.isArray(body.contents)
      ? body.contents
      : null;

    // التحقّق من طول السؤال
    if (prompt.length > 12000) {
      return res.status(400).json({
        error: "Votre message est trop long."
      });
    }

    // التحقّق من حجم الصورة
    if (image && image.length > 7 * 1024 * 1024) {
      return res.status(413).json({
        error: "L'image est trop volumineuse. Réduisez sa taille."
      });
    }

    if (!prompt && !image) {
      return res.status(400).json({
        error: "Veuillez envoyer un message ou une image."
      });
    }

    const contents = [];

    // المحافظة على سياق المحادثة
    if (incomingContents && incomingContents.length > 0) {
      if (incomingContents.length > 26) {
        return res.status(400).json({
          error: "La conversation envoyée est trop longue."
        });
      }

      for (const item of incomingContents) {
        if (
          !item ||
          !["user", "model"].includes(item.role) ||
          !Array.isArray(item.parts)
        ) {
          return res.status(400).json({
            error: "Format de conversation invalide."
          });
        }

        const parts = [];

        for (const part of item.parts) {
          if (
            part &&
            typeof part.text === "string" &&
            part.text.length <= 12000
          ) {
            parts.push({
              text: part.text
            });

          } else if (
            part &&
            part.inlineData &&
            typeof part.inlineData.data === "string"
          ) {
            const mimeType = part.inlineData.mimeType;

            if (
              ![
                "image/jpeg",
                "image/png",
                "image/webp",
                "image/gif"
              ].includes(mimeType)
            ) {
              return res.status(400).json({
                error: "Format d'image non pris en charge."
              });
            }

            if (
              part.inlineData.data.length > 7 * 1024 * 1024
            ) {
              return res.status(413).json({
                error: "L'image est trop volumineuse."
              });
            }

            parts.push({
              inlineData: {
                mimeType,
                data: part.inlineData.data
              }
            });
          }
        }

        if (parts.length > 0) {
          contents.push({
            role: item.role,
            parts
          });
        }
      }
    }

    // Si le frontend n'envoie pas d'historique,
    // construire la requête à partir du message actuel.
    if (contents.length === 0) {
      const parts = [];

      if (prompt) {
        parts.push({
          text: prompt
        });
      }

      if (image) {
        const match = image.match(
          /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=\r\n]+)$/
        );

        if (!match) {
          return res.status(400).json({
            error: "Format d'image invalide."
          });
        }

        parts.push({
          inlineData: {
            mimeType: match[1],
            data: match[2].replace(/\s/g, "")
          }
        });
      }

      contents.push({
        role: "user",
        parts
      });
    }

    // Vérifier que la conversation se termine par un message user
    const lastMessage = contents[contents.length - 1];

    if (!lastMessage || lastMessage.role !== "user") {
      return res.status(400).json({
        error: "Le dernier message doit être un message utilisateur."
      });
    }

    // Gemini API
    // Si ce modèle n'est pas disponible pour votre clé,
    // vérifiez les modèles autorisés dans votre projet Google AI.
    const model = "gemini-3.8-flash";

    const apiUrl =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      model +
      ":generateContent";

    const response = await fetch(apiUrl, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },

      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text:
                "Tu es ASSTRA AI, un assistant intelligent, utile, " +
                "précis et respectueux. " +
                "Réponds dans la langue utilisée par l'utilisateur. " +
                "Tu peux répondre en français, anglais ou arabe. " +
                "Si l'utilisateur écrit en dialecte tunisien, " +
                "essaie de lui répondre en tunisien. " +
                "Explique les sujets difficiles de façon claire. " +
                "Pour le code, fournis des exemples lisibles et complets " +
                "lorsque cela est approprié. " +
                "N'affirme pas avoir effectué une recherche web si " +
                "aucun outil de recherche web n'a été utilisé. " +
                "Si tu n'es pas certain d'une information, précise-le."
            }
          ]
        },

        contents,

        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096
        }
      })
    });

    let data;

    try {
      data = await response.json();
    } catch {
      console.error("Gemini returned invalid JSON.");

      return res.status(502).json({
        error: "Réponse invalide du service IA."
      });
    }

    if (!response.ok) {
      console.error(
        "Gemini API error:",
        response.status,
        data.error?.message || "Unknown error"
      );

      if (response.status === 429) {
        return res.status(429).json({
          error:
            "Limite de requêtes atteinte. Réessayez plus tard " +
            "ou vérifiez les quotas de votre API."
        });
      }

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        return res.status(502).json({
          error:
            "Le service IA a refusé la requête. " +
            "Vérifiez votre clé API, les autorisations et les quotas."
        });
      }

      if (response.status === 404) {
        return res.status(502).json({
          error:
            "Le modèle IA demandé n'est pas disponible. " +
            "Vérifiez le nom du modèle et les modèles autorisés."
        });
      }

      return res.status(502).json({
        error: "Le service IA est momentanément indisponible."
      });
    }

    const candidates = data.candidates || [];

    const reply = candidates
      .flatMap(candidate => candidate.content?.parts || [])
      .filter(part => typeof part.text === "string")
      .map(part => part.text)
      .join("\n");

    if (!reply) {
      const reason = candidates[0]?.finishReason;

      console.error("Gemini returned no text. Reason:", reason);

      return res.status(502).json({
        error:
          reason === "SAFETY"
            ? "La demande n'a pas pu être traitée pour des raisons de sécurité."
            : "Le service IA n'a pas fourni de réponse textuelle."
      });
    }

    return res.status(200).json({
      reply,
      model
    });

  } catch (error) {
    console.error("ASSTRA API error:", error);

    return res.status(500).json({
      error: "Erreur interne du serveur. Réessayez plus tard."
    });
  }
};
