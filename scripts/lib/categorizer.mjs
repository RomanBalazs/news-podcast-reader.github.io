export function autoCategory(text, categories) {
  const input = String(text || "").toLowerCase();

  for (const [categoryId, config] of Object.entries(categories || {})) {
    const keywords = Array.isArray(config?.keywords) ? config.keywords : [];
    if (keywords.some((keyword) => input.includes(String(keyword).toLowerCase()))) {
      return categoryId;
    }
  }

  return "egyeb";
}
