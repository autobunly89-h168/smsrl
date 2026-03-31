const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const fs = require("fs");

const app = express();
app.get("/", (req, res) => res.send("Bot is running"));
app.listen(process.env.PORT || 3000);

const TOKEN = process.env.BOT_TOKEN;
const GOOGLE_WEBHOOK = process.env.GOOGLE_WEBHOOK;

/* ADMIN TELEGRAM ID - ប្តូរលេខនេះទៅជា ID របស់អ្នក */
const ADMIN_ID = 8255247199; 

/* Telegram Bot */
const bot = new TelegramBot(TOKEN, {
  polling: { interval: 300, autoStart: true, params: { timeout: 10 } }
});

bot.on("polling_error", e => console.log("Polling:", e.code));
bot.on("error", e => console.log("Telegram:", e));

console.log("Bot running...");

/* Load user data from JSON file */
let userCardData = {};
if (fs.existsSync("userdata.json")) {
  try {
    userCardData = JSON.parse(fs.readFileSync("userdata.json"));
  } catch (e) {
    userCardData = {};
  }
}

/* Save user data to JSON file */
function saveData() {
  fs.writeFileSync("userdata.json", JSON.stringify(userCardData, null, 2));
}

/* Cambodia Time Format: 31-Mar-2026 */
function getKHTime() {
  const now = new Date();
  const dateParts = now.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Phnom_Penh"
  });

  return {
    date: dateParts.replace(/ /g, "-"),
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

/* --- BOT COMMANDS --- */

/* Start */
bot.onText(/\/start/, msg => {
  bot.sendMessage(msg.chat.id, "សួស្តី! សូមជ្រើសរើសមុខងារខាងក្រោម៖", mainMenu);
});

/* Add / Change Card ID */
bot.on("message", async msg => {
  if (!msg.text || msg.photo) return;

  const chatId = msg.from.id;
  const text = msg.text;

  if (text === "📝 Add Card ID" || text === "🔄 Change Card ID") {
    userCardData[chatId] = { ...userCardData[chatId], step: "waiting" };
    saveData();
    return bot.sendMessage(chatId, "សូមវាយលេខ ID Card របស់អ្នក៖");
  }

  if (userCardData[chatId]?.step === "waiting" && !text.startsWith("/")) {
    userCardData[chatId].temp = text;
    userCardData[chatId].step = "confirm";
    saveData();

    return bot.sendMessage(
      chatId,
      `តើអ្នកចង់ប្រើ ID Card: *${text}* នេះមែនទេ?`,
      {
        parse_mode: "Markdown",
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

/* Confirm / Cancel Callback */
bot.on("callback_query", async query => {
  const fromId = query.from.id;
  const chatId = query.message.chat.id;

  if (query.data.startsWith("save_")) {
    if (userCardData[fromId]) {
      userCardData[fromId].finalId = userCardData[fromId].temp;
      delete userCardData[fromId].step;
      delete userCardData[fromId].temp;
      saveData();

      await bot.answerCallbackQuery(query.id, { text: "រក្សាទុកជោគជ័យ!" });
      await bot.sendMessage(chatId, `✅ ID Card: *${userCardData[fromId].finalId}* រួចរាល់!`, { 
        parse_mode: "Markdown", 
        ...mainMenu 
      });
    }
  }

  if (query.data === "cancel") {
    if (userCardData[fromId]) delete userCardData[fromId].step;
    saveData();
    await bot.answerCallbackQuery(query.id);
    await bot.sendMessage(chatId, "បានបោះបង់ការកំណត់។", mainMenu);
  }
});

/* Change shift */
bot.onText(/\/Change_shift/, async msg => {
  const fromId = msg.from.id;
  const { date, time } = getKHTime();
  const web = msg.from.first_name?.toUpperCase() || "UNKNOWN";
  const myCardId = userCardData[fromId]?.finalId || "Not Set";

  const reportText = 
`🌐 Web: ${web}
🆔 ID: /Change_shift
🪪 Card ID: ${myCardId}
📅 Date: ${date}
⏰ Time: ${time}`;

  await bot.sendMessage(msg.chat.id, reportText);

  if (myCardId !== "Not Set") {
    axios.post(GOOGLE_WEBHOOK, { web, id: "/Change_shift", cardId: myCardId, date, time })
      .catch(() => console.log("Sheet Error"));
  }
});

/* Photo with Caption */
bot.on("photo", async msg => {
  const fromId = msg.from.id;
  const { date, time } = getKHTime();
  const id = msg.caption?.trim() || "NoID";
  const web = msg.from.first_name?.toUpperCase() || "UNKNOWN";
  const myCardId = userCardData[fromId]?.finalId || "Not Set";

  const reportText = 
`🌐 Web: ${web}
🆔 ID: ${id}
🪪 Card ID: ${myCardId}
📅 Date: ${date}
⏰ Time: ${time}`;

  await bot.sendMessage(msg.chat.id, reportText, { reply_to_message_id: msg.message_id });

  if (myCardId !== "Not Set") {
    axios.post(GOOGLE_WEBHOOK, { web, id, cardId: myCardId, date, time })
      .catch(() => console.log("Sheet Error"));
  }
});

/* --- ADMIN FUNCTIONS --- */

bot.onText(/\/all_users/, msg => {
  if (msg.from.id !== ADMIN_ID) return;
  let text = "📋 **User List:**\n";
  for (let id in userCardData) {
    if(userCardData[id].finalId) text += `\n👤 \`${id}\` ➔ ${userCardData[id].finalId}`;
  }
  bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
});

bot.onText(/\/delete_user (.+)/, (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return;
  const targetId = match[1];
  if (userCardData[targetId]) {
    delete userCardData[targetId];
    saveData();
    bot.sendMessage(msg.chat.id, `🗑 បានលុប User ID: ${targetId}`);
  } else {
    bot.sendMessage(msg.chat.id, "❌ រកមិនឃើញ User នេះទេ។");
  }
});

/* Quote Reply Function */
bot.onText(/\/quote (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const replyText = match[1];

  if (!msg.reply_to_message) {
    return bot.sendMessage(chatId, "❌ សូមប្រើ /quote ដោយធ្វើការ Reply ទៅលើសារណាមួយ។");
  }

  const originalMsg = msg.reply_to_message.text || msg.reply_to_message.caption || "រូបភាព/ឯកសារ";
  const senderName = msg.reply_to_message.from.first_name || "User";

  const quoteTemplate = 
`💬 **Quote ពី:** ${senderName}
"_${originalMsg}_"

➡️ **ឆ្លើយតប:** ${replyText}`;

  bot.sendMessage(chatId, quoteTemplate, { 
    parse_mode: "Markdown",
    reply_to_message_id: msg.reply_to_message.message_id 
  });
});
