require("dotenv").config();
const { REST, Routes } = require("discord.js");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
    console.log("🔍 Checking commands...");
    const guildCommands = await rest.get(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID));
    const globalCommands = await rest.get(Routes.applicationCommands(CLIENT_ID));

    console.log("\n📦 Guild Commands:");
    guildCommands.forEach(c => console.log(`- ${c.name} (${c.id})`));

    console.log("\n🌍 Global Commands:");
    globalCommands.forEach(c => console.log(`- ${c.name} (${c.id})`));

    console.log("\n✅ Done.");
})();
