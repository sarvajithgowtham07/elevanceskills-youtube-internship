const translateText = async (req, res) => {
  try {
    const { text, targetLanguage } = req.body;

    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ message: "Text is required." });
    }

    if (text.trim().length > 500) {
      return res.status(400).json({ message: "Text must be 500 characters or fewer." });
    }

    const supportedLanguages = ["en", "te"];
    const sourceLanguage = req.body.sourceLanguage;

    if (
      !supportedLanguages.includes(targetLanguage) ||
      !supportedLanguages.includes(sourceLanguage)
    ) {
      return res.status(400).json({ message: "Unsupported source or target language." });
    }

    if (sourceLanguage === targetLanguage) {
      return res.status(400).json({ message: "Source and target languages must be different." });
    }

    const params = new URLSearchParams({
      q: text.trim(),
      langpair: `${sourceLanguage}|${targetLanguage}`
    });

    const response = await fetch(
      `https://api.mymemory.translated.net/get?${params.toString()}`
    );

    if (!response.ok) {
      return res.status(502).json({ message: "Translation service unavailable." });
    }

    const data = await response.json();
    const translatedText = data.responseData?.translatedText?.trim();

    if (data.responseStatus !== 200 || !translatedText) {
      return res.status(502).json({
        message: "No translation available. Please try a different comment."
      });
    }

    return res.status(200).json({ translatedText, sourceLanguage, targetLanguage });
  } catch (error) {
    console.error("Translation error:", error);
    return res.status(500).json({
      message: "Translation failed. Please try again."
    });
  }
};

export { translateText };