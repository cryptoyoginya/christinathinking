// Telegram MarkdownV2 escaping
export function escapeMarkdown(s) {
  return (s || "")
    .replace(/\\/g, "\\\\")
    .replace(/([_*[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

// Telegram message limit is 4096 chars. Safer to split.
export function splitMessage(text, maxLen = 3500) {
  const chunks = [];
  let t = text || "";
  while (t.length > maxLen) {
    chunks.push(t.slice(0, maxLen));
    t = t.slice(maxLen);
  }
  if (t.length) chunks.push(t);
  return chunks;
}
