const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

const app = express();
app.get("/", (req, res) => res.send("Bot is running"));
app.listen(process.env.PORT || 3000);

const TOKEN = process.env.BOT_TOKEN;
const GOOGLE_WEBHOOK = process.env.GOOGLE_WEBHOOK;

/* Telegram Bot */
const bot = new TelegramBot(TOKEN, {
  polling: { interval: 300, autoStart: true, params: { timeout: 10 } }
});

bot.on("polling_error", e => console.log("Polling:", e.code));
bot.on("error", e => console.log("Telegram:", e));

console.log("Bot running...");

let userCardData = {};

/* Cambodia Time */
function getKHTime() {
  const now = new Date();
  
  // កំណត់ទម្រង់ថ្ងៃខែឱ្យចេញជា 31-Mar-2026
  const dateParts = now.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Phnom_Penh"
  });

  // ប្តូរពីដកឃ្លា (Space) មកជាសញ្ញាដាច់ (-)
  const formattedDate = dateParts.replace(/ /g, "-");

  return {
    date: formattedDate,
    time: now.toLocaleTimeString("en-GB", { 
      hour12: false, 
      timeZone: "Asia/Phnom_Penh" 
    })
  };
}

const mainMenu = {
  reply_markup:{
    keyboard:[
      [{text:"📝 Add Card ID"},{text:"🔄 Change Card ID"}],
      [{text:"/Change_shift"}]
    ],
    resize_keyboard:true
  }
};

/* Start */
bot.onText(/\/start/, msg=>{
  bot.sendMessage(msg.chat.id,"សួស្តី! សូមជ្រើសរើសមុខងារ:",mainMenu);
});

/* Add Card */
bot.on("message", async msg=>{
  if(!msg.text || msg.photo) return;

  const chatId = msg.from.id;
  const text = msg.text;

  if(text==="📝 Add Card ID"||text==="🔄 Change Card ID"){
    userCardData[chatId]={step:"waiting"};
    return bot.sendMessage(chatId,"សូមវាយលេខ ID Card របស់អ្នក:");
  }

  if(userCardData[chatId]?.step==="waiting" && !text.startsWith("/")){
    userCardData[chatId].temp = text;
    userCardData[chatId].step = "confirm";

    return bot.sendMessage(
      chatId,
      `តើអ្នកចង់ប្រើ ID Card: ${text} នេះមែនទេ?`,
      {
        reply_markup:{
          inline_keyboard:[[
            {text:"✅ បញ្ជាក់ (Confirm)",callback_data:`save_${chatId}`},
            {text:"❌ បោះបង់",callback_data:"cancel"}
          ]]
        }
      }
    );
  }
});

/* Confirm / Cancel */
bot.on("callback_query", async query=>{

  const fromId = query.from.id;

  if(query.data.startsWith("save_")){
    if(userCardData[fromId]){
      userCardData[fromId].finalId = userCardData[fromId].temp;
      delete userCardData[fromId].step;

      await bot.answerCallbackQuery(query.id,{text:"រក្សាទុកបានជោគជ័យ!"});

      await bot.sendMessage(
        query.message.chat.id,
        `✅ ID Card: ${userCardData[fromId].finalId} រួចរាល់!`,
        mainMenu
      );
    }
  }

  if(query.data==="cancel"){
    delete userCardData[fromId];

    await bot.sendMessage(
      query.message.chat.id,
      "បានបោះបង់ការកំណត់។",
      mainMenu
    );
  }

});

/* Change shift */
bot.onText(/\/Change_shift/, async msg=>{

  const fromId = msg.from.id;
  const {date,time} = getKHTime();

  const web = msg.from.first_name?.toUpperCase() || "UNKNOWN";
  const myCardId = userCardData[fromId]?.finalId || "Not Set";

  const text =
`🌐 Web: ${web}
🆔 ID: /Change_shift
🪪 ID Card: ${myCardId}
📅 Date: ${date}
⏰ Time: ${time}`;

  await bot.sendMessage(msg.chat.id,text);

  if(myCardId!=="Not Set"){
    axios.post(GOOGLE_WEBHOOK,{
      web,id:"/Change_shift",cardId:myCardId,date,time
    }).catch(()=>console.log("Sheet Error"));
  }

});

/* Photo */
bot.on("photo", async msg=>{

  const fromId = msg.from.id;
  const {date,time} = getKHTime();

  const id = msg.caption?.trim() || "NoID";
  const web = msg.from.first_name?.toUpperCase() || "UNKNOWN";
  const myCardId = userCardData[fromId]?.finalId || "Not Set";

  const text =
`🌐 Web: ${web}
🆔 ID: ${id}
🪪 ID Card: ${myCardId}
📅 Date: ${date}
⏰ Time: ${time}`;

  await bot.sendMessage(msg.chat.id,text,{
    reply_to_message_id:msg.message_id
  });

  if(myCardId!=="Not Set"){
    axios.post(GOOGLE_WEBHOOK,{
      web,id,cardId:myCardId,date,time
    }).catch(()=>console.log("Sheet Error"));
  }

});