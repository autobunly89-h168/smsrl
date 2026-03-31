const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const fs = require("fs");

const app = express();
app.get("/", (req, res) => res.send("Bot is running"));
app.listen(process.env.PORT || 3000);

const TOKEN = process.env.BOT_TOKEN;
const GOOGLE_WEBHOOK = process.env.GOOGLE_WEBHOOK;

/* ADMIN TELEGRAM ID */
const ADMIN_ID = 8255247199; // ដាក់ Telegram ID admin របស់អ្នក

/* Telegram Bot */
const bot = new TelegramBot(TOKEN, {
  polling: { interval: 300, autoStart: true, params: { timeout: 10 } }
});

bot.on("polling_error", e => console.log("Polling:", e.code));
bot.on("error", e => console.log("Telegram:", e));

console.log("Bot running...");

/* Load user data */
let userCardData = {};
if (fs.existsSync("userdata.json")) {
  userCardData = JSON.parse(fs.readFileSync("userdata.json"));
}

/* Save user data */
function saveData() {
  fs.writeFileSync("userdata.json", JSON.stringify(userCardData, null, 2));
}

/* Cambodia Time */
function getKHTime() {
  const now = new Date();
  return {
    date: now.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Phnom_Penh"
    }).replace(/ /g, "-"),
    time: now.toLocaleTimeString("en-GB", {
      hour12: false,
      timeZone: "Asia/Phnom_Penh"
    })
  };
}

const mainMenu = {
  reply_markup: {
    keyboard: [
      [{ text: "📝 Add Card ID" }, { text: "🔄 Change Card ID" }],
      [{ text: "/Change_shift" }]
    ],
    resize_keyboard: true
  }
};

/* Start */
bot.onText(/\/start/, msg => {
  bot.sendMessage(msg.chat.id, "សួស្តី! សូមជ្រើសរើសមុខងារ:", mainMenu);
});

/* Add Card */
bot.on("message", async msg => {
  if (!msg.text || msg.photo) return;

  const chatId = msg.from.id;
  const text = msg.text;

  if (text === "📝 Add Card ID" || text === "🔄 Change Card ID") {
    userCardData[chatId] = { step: "waiting" };
    saveData();
    return bot.sendMessage(chatId, "សូមវាយលេខ ID Card របស់អ្នក:");
  }

  if (userCardData[chatId]?.step === "waiting" && !text.startsWith("/")) {
    userCardData[chatId].temp = text;
    userCardData[chatId].step = "confirm";
    saveData();

    return bot.sendMessage(
      chatId,
      `តើអ្នកចង់ប្រើ ID Card: ${text} នេះមែនទេ?`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: "✅ Confirm", callback_data: `save_${chatId}` },
            { text: "❌ Cancel", callback_data: "cancel" }
          ]]
        }
      }
    );
  }
});

/* Confirm / Cancel */
bot.on("callback_query", async query => {
  const fromId = query.from.id;

  if (query.data.startsWith("save_")) {
    if (userCardData[fromId]) {
      userCardData[fromId].finalId = userCardData[fromId].temp;
      delete userCardData[fromId].step;
      saveData();

      await bot.answerCallbackQuery(query.id, { text: "រក្សាទុកបានជោគជ័យ!" });

      await bot.sendMessage(
        query.message.chat.id,
        `✅ ID Card: ${userCardData[fromId].finalId}`,
        mainMenu
      );
    }
  }

  if (query.data === "cancel") {
    delete userCardData[fromId];
    saveData();

    await bot.sendMessage(query.message.chat.id, "បានបោះបង់", mainMenu);
  }
});

/* Change shift */
bot.onText(/\/Change_shift/, async msg => {
  const fromId = msg.from.id;
  const { date, time } = getKHTime();

  const web = msg.from.first_name?.toUpperCase() || "UNKNOWN";
  const myCardId = userCardData[fromId]?.finalId || "Not Set";

  const text =
`🌐 Web: ${web}
🆔 ID: /Change_shift
🪪 Card ID: ${myCardId}
📅 Date: ${date}
⏰ Time: ${time}`;

  await bot.sendMessage(msg.chat.id, text);

  if (myCardId !== "Not Set") {
    axios.post(GOOGLE_WEBHOOK, {
      web,
      id: "/Change_shift",
      cardId: myCardId,
      date,
      time
    }).catch(() => console.log("Sheet Error"));
  }
});

/* Photo */
bot.on("photo", async msg => {
  const fromId = msg.from.id;
  const { date, time } = getKHTime();

  const id = msg.caption?.trim() || "NoID";
  const web = msg.from.first_name?.toUpperCase() || "UNKNOWN";
  const myCardId = userCardData[fromId]?.finalId || "Not Set";

  const text =
`🌐 Web: ${web}
🆔 ID: ${id}
🪪 Card ID: ${myCardId}
📅 Date: ${date}
⏰ Time: ${time}`;

  await bot.sendMessage(msg.chat.id, text);

  if (myCardId !== "Not Set") {
    axios.post(GOOGLE_WEBHOOK, {
      web,
      id,
      cardId: myCardId,
      date,
      time
    }).catch(() => console.log("Sheet Error"));
  }
});

/* Admin View Users */
bot.onText(/\/all_users/, msg => {
  if (msg.from.id !== ADMIN_ID) return;

  let text = "📋 User List:\n";

  for (let id in userCardData) {
    text += `\n${id} → ${userCardData[id].finalId || "No Card"}`;
  }

  bot.sendMessage(msg.chat.id, text);
});

/* Find User */
bot.onText(/\/find (.+)/, (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;

  const userId = match[1];

  if (userCardData[userId]) {
    bot.sendMessage(
      msg.chat.id,
      `🔍 ${userId} → ${userCardData[userId].finalId || "No Card"}`
    );
  } else {
    bot.sendMessage(msg.chat.id, "❌ User not found");
  }
});

/* Delete User */
bot.onText(/\/delete_user (.+)/, (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;

  const userId = match[1];

  if (userCardData[userId]) {
    delete userCardData[userId];
    saveData();
    bot.sendMessage(msg.chat.id, `🗑 Deleted ${userId}`);
  } else {
    bot.sendMessage(msg.chat.id, "❌ User not found");
  }
});

/* Today Report */
bot.onText(/\/today_report/, msg => {
  if (msg.from.id !== ADMIN_ID) return;

  let count = 0;

  for (let id in userCardData) {
    if (userCardData[id].finalId) count++;
  }

  bot.sendMessage(msg.chat.id, `📊 Total Users: ${count}`);
});
