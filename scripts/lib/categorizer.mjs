export function autoCategory(title, categoriesConfig) {
  const normalizedTitle = String(title || "").toLowerCase();
  let best = { id: "egyeb", score: 0 };

  for (const [id, config] of Object.entries(categoriesConfig || {})) {
    const keywords = Array.isArray(config?.keywords) ? config.keywords : [];
    let score = 0;

    for (const keyword of keywords) {
      if (normalizedTitle.includes(String(keyword).toLowerCase())) {
        score += 1;
      }
    }

    if (score > best.score) {
      best = { id, score };
    }
  }

  return best.score > 0 ? best.id : "egyeb";
}
