// === jadi.js — Pemantau SMS + Bot Telegram ===
// Jalankan di VPS / Termux
// Pastikan sudah install: npm install axios

const axios = require("axios");
const fs = require("fs");

// === KONFIGURASI ===
const username = "boby";
const password = "boby123";
const baseUrl = "https://d-group.stats.direct/rest/sms";
const lastIdFile = "./lastId.txt";

// Token dan chat ID Telegram
const TELEGRAM_TOKEN = "8201128453:AAEUTjCwzpdSV8YjUCLolkLRC1S_82rh_yE";
const CHAT_ID = "-1003247283266";

// Autentikasi dasar
const auth = Buffer.from(username + ":" + password).toString("base64");
const POLL_MS = 10000; // Delay 10 detik
const perPage = 100;

// === File lastId ===
let lastId = 0;
if (fs.existsSync(lastIdFile)) {
  try {
    lastId = parseInt(fs.readFileSync(lastIdFile, "utf8")) || 0;
  } catch (e) {
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

function cleanText(text) {
  return (text || "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeMarkdown(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

async function sendToTelegram(text) {
  const url = "https://api.telegram.org/bot" + TELEGRAM_TOKEN + "/sendMessage";
  try {
    await axios.post(url, {
      chat_id: CHAT_ID,
      text: escapeMarkdown(text),
      parse_mode: "MarkdownV2",
    });
  } catch (err) {
    const errMsg = (err.response && err.response.data) || err.message;
    console.error("❌ Gagal kirim ke Telegram:", errMsg);
  }
}

async function fetchSMS() {
  try {
    const res = await axios.get(baseUrl, {
      params: { page: 1, "per-page": perPage },
      headers: {
        Authorization: "Basic " + auth,
        Accept: "application/json",
        "User-Agent": "TelegramSMSBot/1.0",
      },
      timeout: 7000,
    });
    return Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    if (err.response && err.response.status === 429) {
      console.warn("🚦 Terlalu sering meminta data — jeda 10 detik tambahan...");
      await new Promise(function (r) {
        setTimeout(r, 10000);
      });
    } else {
      console.error("⚠️ Gagal ambil SMS:", err.message);
    }
    return [];
  }
}

async function tampilkanSMS(sms) {
  const negara = detectCountry(sms.destination_addr);
  const waktu = sms.start_stamp || "-";
  const nomor = sms.destination_addr || "-";
  const kode = extractCode(sms.short_message);
  const app = detectApp(sms);
  const pesan = cleanText(sms.short_message);

  const teks =
    "\n📍 *Negara:* " +
    negara +
    "\n🕒 *Waktu:* " +
    waktu +
    "\n💠 *Aplikasi:* " +
    app +
    "\n📱 *Nomor:* " +
    nomor +
    "\n🔢 *Kode utama:* `" +
    kode +
    "`\n\n────────────────────────────\n📩 *Pesan:*\n" +
    pesan +
    "\n────────────────────────────\n";

  console.log(teks);
  fs.appendFileSync("log.txt", teks + "\n", "utf8");
  await sendToTelegram(teks);
}

async function loopSMS() {
  console.log("🤖 Bot Telegram aktif — memantau SMS setiap 10 detik...\n");

  setInterval(async function () {
    const smsList = await fetchSMS();
    if (!smsList.length) return;

    const newSMS = smsList
      .map(function (s) {
        return { ...s, _id: parseInt(s.id) };
      })
      .filter(function (s) {
        return s._id > lastId;
      })
      .sort(function (a, b) {
        return a._id - b._id;
      });

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
