const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  throw new Error("BOT_TOKEN is missing in env");
}

const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const BOT_TOKEN = process.env.BOT_TOKEN;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

export async function getFileUrl(fileId) {
  const r = await fetch(`${API}/getFile?file_id=${fileId}`);
  const data = await r.json();
  if (!data.ok) throw new Error("Telegram getFile failed");
  const filePath = data.result.file_path;
  return `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
}

export async function sendMessage(chatId, text, extra = {}) {
  const r = await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...extra })
  });
  const data = await r.json();
  if (!data.ok) console.warn("sendMessage failed:", data);
  return data;
}
