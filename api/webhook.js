import { getFileUrl, sendMessage } from "../lib/telegram.js";
import { transcribeAudio, makeNote } from "../lib/gemini.js";
import { escapeMarkdown, splitMessage } from "../lib/format.js";

const ALLOWED_USER_ID = Number(process.env.ALLOWED_USER_ID || 0);

function detectMimeType(msg) {
  // Telegram voice обычно ogg/opus
  if (msg.voice) return "audio/ogg";
  // audio может быть mp3/m4a/ogg — mime_type приходит
  if (msg.audio?.mime_type) return msg.audio.mime_type;
  // video_note — по факту mp4 контейнер, но аудиодорожка извлекается моделью нормально
  if (msg.video_note) return "video/mp4";
  if (msg.document?.mime_type) return msg.document.mime_type;
  return "audio/ogg";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  // СРАЗУ отвечаем Telegram, чтобы не было таймаутов
  res.status(200).send("ok");
  console.log("BODY:", JSON.stringify(req.body).slice(0, 500));

  try {
    const update = req.body;
    const msg = update.message || update.edited_message;
    if (!msg) return;

    const chatId = msg.chat.id;
    const fromId = msg.from?.id;

    // Приватный бот — отвечает только тебе
    if (ALLOWED_USER_ID && fromId !== ALLOWED_USER_ID) {
      await sendMessage(chatId, "Извини, бот приватный 🙂");
      return;
    }

    const fileObj =
      msg.voice ||
      msg.audio ||
      msg.video_note ||
      (msg.document?.mime_type?.startsWith("audio/") ? msg.document : null);

    if (!fileObj) {
      await sendMessage(chatId, "Пришли голосовое/аудио/кружочек — сделаю 📝 транскрипцию и 📋 заметку.");
      return;
    }

    await sendMessage(chatId, "⏳ Приняла. Делаю транскрипцию максимально качественно…");

    const fileId = fileObj.file_id;
    const fileUrl = await getFileUrl(fileId);
    const mimeType = detectMimeType(msg);

    // 1) Транскрипция (2-проходная в lib/gemini.js)
    const transcript = await transcribeAudio(fileUrl, mimeType);

    await sendMessage(chatId, "🧠 Собираю заметку…");

    // 2) Заметка в твоём формате
    const note = await makeNote(transcript);

    // Telegram лимит ~4096 символов. Шлём частями.
    const header1 = "📝 *Транскрипция*\n";
    const header2 = "📋 *Заметка*\n";

    const transcriptChunks = splitMessage(escapeMarkdown(transcript), 3500);
    const noteChunks = splitMessage(escapeMarkdown(note), 3500);

    // Транскрипция
    for (let i = 0; i < transcriptChunks.length; i++) {
      const prefix = i === 0 ? header1 : "";
      await sendMessage(chatId, prefix + transcriptChunks[i], { parse_mode: "MarkdownV2" });
    }

    // Заметка
    for (let i = 0; i < noteChunks.length; i++) {
      const prefix = i === 0 ? header2 : "";
      await sendMessage(chatId, prefix + noteChunks[i], { parse_mode: "MarkdownV2" });
    }
  } catch (e) {
    console.error("ERROR:", e?.message);
    console.error("STACK:", e?.stack);
  }
}
