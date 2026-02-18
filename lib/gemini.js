const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Модели можно менять. Для качества транскрипции обычно лучше "pro", для скорости/дешевле — "flash".
// Если у тебя free tier и важно "почти бесплатно" — оставь flash.
const MODEL_TRANSCRIBE = process.env.GEMINI_TRANSCRIBE_MODEL || "gemini-2.0-flash";
const MODEL_NOTE = process.env.GEMINI_NOTE_MODEL || "gemini-2.0-flash";

async function downloadAsBase64(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("Failed to download audio from Telegram");
  const buf = Buffer.from(await r.arrayBuffer());
  return buf.toString("base64");
}

async function geminiGenerateText(model, parts) {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const body = {
    contents: [{ role: "user", parts }],
    // чуть более “детерминированно”, меньше фантазии
    generationConfig: { temperature: 0.2 }
  };

  const r = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await r.json();
  const text = data?.candidates?.[0]?.content?.parts
    ?.map(p => p.text)
    ?.filter(Boolean)
    ?.join("\n")
    ?.trim();

  if (!text) {
    throw new Error("Gemini returned empty response");
  }
  return text;
}

export async function transcribeAudio(fileUrl, mimeType = "audio/ogg") {
  const audioB64 = await downloadAsBase64(fileUrl);

  // Проход 1 — распознавание
  const prompt1 =
    `Сделай МАКСИМАЛЬНО ТОЧНУЮ транскрипцию аудио.\n` +
    `Правила:\n` +
    `- Язык оригинала (рус/англ смешано — сохраняй как есть)\n` +
    `- Английские слова пиши ЛАТИНИЦЕЙ (AI buddy, embedding, agent и т.п.)\n` +
    `- Не выдумывай: если не уверен, дай 2 варианта в скобках: (buddy/body)\n` +
    `- Убирай паразиты ("ээ", "ну") только если это НЕ портит смысл\n` +
    `- Сохраняй термины, имена, числа, названия\n` +
    `- Если говорящий перескакивает — сохраняй естественные абзацы\n` +
    `Выведи только транскрипцию, без комментариев.`;

  const raw = await geminiGenerateText(MODEL_TRANSCRIBE, [
    { text: prompt1 },
    { inlineData: { mimeType, data: audioB64 } }
  ]);

  // Проход 2 — лёгкая корректура (улучшает “AI body” → “AI buddy”, но не переписывает смысл)
  const prompt2 =
    `Исправь очевидные ошибки распознавания в тексте ниже.\n` +
    `Правила:\n` +
    `- НЕ перефразируй и НЕ сокращай\n` +
    `- Исправляй только явные опечатки/неверно распознанные слова\n` +
    `- Английские слова оставляй латиницей\n` +
    `- Если сомневаешься — оставь как было или дай 2 варианта в скобках\n` +
    `Выведи только исправленный текст.\n\n` +
    `Текст:\n"""${raw}"""`;

  const cleaned = await geminiGenerateText(MODEL_TRANSCRIBE, [{ text: prompt2 }]);

  return cleaned.trim();
}

export async function makeNote(transcript) {
  const prompt =
`Ты — ассистент, который превращает расшифровку голосовой заметки в короткую структурированную заметку НА РУССКОМ.

Сделай заметку строго в формате (заголовки точно такие):

Темы:
Самое важное:
Действия (при наличии):
Скрытое из разговора:
Комплимент мыслям Кристины:

Правила:
- Темы: 3–7 коротких тем (через запятую или буллетами)
- Самое важное: 3–7 буллетов, без воды, только смысл
- Действия: только если реально есть действия, иначе напиши "—"
- Скрытое из разговора: 2–5 буллетов с подразумеваемыми мотивами/контекстом/предпосылками, но НЕ выдумывай факты
- Комплимент: 1–2 предложения, тёплый комплимент мыслям Кристины, без сюсюканья, по делу
- Ничего не добавляй сверх этих секций.

Транскрипция:
"""${transcript}"""`;

  return await geminiGenerateText(MODEL_NOTE, [{ text: prompt }]);
}
