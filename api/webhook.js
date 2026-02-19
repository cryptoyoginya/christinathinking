import { getFileUrl, sendMessage } from "../lib/telegram.js";
import { transcribeAudio, makeNote } from "../lib/gemini.js";
import { escapeMarkdown, splitMessage } from "../lib/format.js";

const ALLOWED_USER_ID = Number(process.env.ALLOWED_USER_ID || 0);

function detectMimeType(msg) {
  if (msg.voice) return "audio/ogg";
  if (msg.audio?.mime_type) return msg.audio.mime_type;
  if (msg.video_note) return "video/mp4";
  if (msg.document?.mime_type) return msg.document.mime_type;
  return "audio/ogg";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  res.status(200).send("ok");

  console.log("BODY:", JSON.stringify(req.body).slice(0, 500));

  const ping = await fetch("https://api.telegram.org").then(r => r.status).catch(e => "FAIL: " + String(e?.cause));
  console.log("PING:", ping);

  try {
    const update = req.body;
    const msg = update.message || update.edited_message;
    if (!msg) { console.log("NO MSG"); return; }

    const chatId = msg.chat.id;
    const fromId = msg.from?.id;
    console.log("FROM:", fromId, "ALLOWED:", ALLOWED_USER_ID);

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
      console.log("NO FILE OBJ");
      await sendMessage(chatId, "Пришли голосовое/аудио/кружочек — сделаю 📝 транскрипцию и 📋 заметку.");
      return;
    }

    console.log("STEP 1: sending first message");
    await sendMessage(chatId, "⏳ Приняла. Делаю транскрипцию максимально качественно…");

    console.log("STEP 2: getting file url");
    const fileUrl = await getFileUrl(fileObj.file_id);
    console.log("STEP 3: got fileUrl", fileUrl.slice(0, 60));

    const mimeType = detectMimeType(msg);
    console.log("STEP 4: transcribing, mimeType:", mimeType);
    const transcript = await transcribeAudio(fileUrl, mimeType);
    console.log("STEP 5: transcript done", transcript.slice(0, 80));

    await sendMessage(chatId, "🧠 Собираю заметку…");

    console.log("STEP 6: making note");
    const note = await makeNote(transcript);
    console.log("STEP 7: note done", note.slice(0, 80));

    const header1 = "📝 *Транскрипция*\n";
    const header2 = "📋 *Заметка*\n";

    const transcriptChunks = splitMessage(escapeMarkdown(transcript), 3500);
    const noteChunks = splitMessage(escapeMarkdown(note), 3500);

    for (let i = 0; i < transcriptChunks.length; i++) {
      await sendMessage(chatId, (i === 0 ? header1 : "") + transcriptChunks[i], { parse_mode: "MarkdownV2" });
    }

    for (let i = 0; i < noteChunks.length; i++) {
      await sendMessage(chatId, (i === 0 ? header2 : "") + noteChunks[i], { parse_mode: "MarkdownV2" });
    }

    console.log("DONE");

  } catch (e) {
    console.error("ERROR:", e?.message);
    console.error("STACK:", e?.stack);
  }
}
