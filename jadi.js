// === bot.js — Pemantau SMS + Bot Telegram ===
// Jalankan di Termux / Node.js
// Pastikan sudah install: npm install axios

import axios from "axios";
import fs from "fs";

// === KONFIGURASI ===
const username = "boby";
const password = "boby123";
const baseUrl = "https://d-group.stats.direct/rest/sms";
const lastIdFile = "./lastId.txt";

// Ganti token & chat ID kamu 👇
const TELEGRAM_TOKEN = "8201128453:AAEUTjCwzpdSV8YjUCLolkLRC1S_82rh_yE";
const CHAT_ID = "-1003247283266";

const auth = Buffer.from(`${username}:${password}`).toString("base64");
const POLL_MS = 10000; // ⏱️ Delay 10 detik (aman dari 429)
const perPage = 100;

// === Pastikan file lastId aman ===
let lastId = 0;
if (fs.existsSync(lastIdFile)) {
  try {
    lastId = parseInt(fs.readFileSync(lastIdFile, "utf8")) || 0;
  } catch {
    lastId = 0;
  }
}

const shownCodes = new Set();

// === Fungsi bantu ===
function detectCountry(number) {
  if (!number) return "Tidak diketahui 🌍";
  const n = number.toString();
  if (n.startsWith("62")) return "Indonesia 🇮🇩";
  if (n.startsWith("249")) return "Sudan 🇸🇩";
  if (n.startsWith("91")) return "India 🇮🇳";
  if (n.startsWith("1")) return "Amerika Serikat 🇺🇸";
  if (n.startsWith("44")) return "Inggris 🇬🇧";
  if (n.startsWith("966")) return "Arab Saudi 🇸🇦";
  if (n.startsWith("229")) return "Benin 🇧🇯";
  if (n.startsWith("20")) return "Mesir 🇪🇬";
  if (n.startsWith("58")) return "Venezuela 🇻🇪";
  return "Tidak diketahui 🌍";
}

function detectApp(sms) {
  const src = (sms.source_addr || "").toLowerCase();
  const msg = (sms.short_message || "").toLowerCase();
  if (src.includes("whatsapp") || msg.includes("whatsapp")) return "WhatsApp 💬";
  if (msg.includes("telegram")) return "Telegram ✈️";
  if (msg.includes("facebook")) return "Facebook 📘";
  if (msg.includes("tiktok")) return "TikTok 🎵";
  if (msg.includes("instagram")) return "Instagram 📸";
  if (msg.includes("gmail") || msg.includes("google")) return "Google ✉️";
  return "Tidak diketahui 🤔";
}

function extractCode(msg) {
  if (!msg) return "-";
  const regex = /\b\d{3}-\d{3}\b|\b\d{6}\b|\b\d{4}\b/g;
  const found = msg.match(regex);
  return found ? found[0] : "-";
}

// Hilangkan karakter aneh agar tidak error 400 di Telegram
function cleanText(text) {
  return (text || "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Escape karakter Markdown agar Telegram aman
function escapeMarkdown(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

// === Kirim pesan ke Telegram ===
async function sendToTelegram(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  try {
    await axios.post(url, {
      chat_id: CHAT_ID,
      text: escapeMarkdown(text),
      parse_mode: "MarkdownV2",
    });
  } catch (err) {
    console.error("❌ Gagal kirim ke Telegram:", err.response?.data || err.message);
  }
}

// === Ambil data dari server ===
async function fetchSMS() {
  try {
    const res = await axios.get(baseUrl, {
      params: { page: 1, "per-page": perPage },
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "User-Agent": "TelegramSMSBot/1.0",
      },
      timeout: 7000,
    });
    return Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    if (err.response?.status === 429) {
      console.warn("🚦 Terlalu sering meminta data — jeda 10 detik tambahan...");
      await new Promise((r) => setTimeout(r, 10000)); // jeda 10 detik tambahan
    } else {
      console.error("⚠️ Gagal ambil SMS:", err.message);
    }
    return [];
  }
}

// === Kirim SMS baru ke Telegram ===
async function tampilkanSMS(sms) {
  const negara = detectCountry(sms.destination_addr);
  const waktu = sms.start_stamp || "-";
  const nomor = sms.destination_addr || "-";
  const kode = extractCode(sms.short_message);
  const app = detectApp(sms);
  const pesan = cleanText(sms.short_message);

  const teks = `
📍 *Negara:* ${negara}
🕒 *Waktu:* ${waktu}
💠 *Aplikasi:* ${app}
📱 *Nomor:* ${nomor}
🔢 *Kode utama:* \`${kode}\`

────────────────────────────
📩 *Pesan:*
${pesan}
────────────────────────────
`;

  console.log(teks);
  fs.appendFileSync("log.txt", teks + "\n", "utf8"); // log ke file juga
  await sendToTelegram(teks);
}

// === Loop utama ===
async function loopSMS() {
  console.log("🤖 Bot Telegram aktif — memantau SMS setiap 10 detik...\n");

  setInterval(async () => {
    const smsList = await fetchSMS();
    if (!smsList.length) return;

    const newSMS = smsList
      .map((s) => ({ ...s, _id: parseInt(s.id) }))
      .filter((s) => s._id > lastId)
      .sort((a, b) => a._id - b._id);

    for (const sms of newSMS) {
      const kode = extractCode(sms.short_message);
      if (shownCodes.has(kode)) continue;
      shownCodes.add(kode);

      await tampilkanSMS(sms);
      lastId = Math.max(lastId, sms._id);
    }

    if (newSMS.length > 0) {
      fs.writeFileSync(lastIdFile, String(lastId));
    }
  }, POLL_MS);
}

loopSMS();
