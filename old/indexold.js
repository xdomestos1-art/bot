require("dotenv").config();
const fs = require("fs");
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder } = require("discord.js");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const BUYER_ROLE_ID = process.env.BUYER_ROLE_ID;
const OWNER_ID = process.env.OWNER_ID;

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent]
});

// ---------- HELPERS ----------
function loadKeys() {
    try {
        return fs.readFileSync("./keys.txt", "utf8").split(/\r?\n/).map(k => k.trim()).filter(k => k.length > 0);
    } catch { return []; }
}

function loadRedeemedKeys() {
    try { return JSON.parse(fs.readFileSync("./redeemedKeys.json", "utf8")); }
    catch { return {}; }
}

function saveRedeemedKeys(data) {
    fs.writeFileSync("./redeemedKeys.json", JSON.stringify(data, null, 4), "utf8");
}

// ---------- SLASH COMMANDS ----------
const commands = [
    new SlashCommandBuilder().setName("script_panel").setDescription("Aethra Script Access Panel"),
    new SlashCommandBuilder().setName("userinfo").setDescription("Check a user's key & info").addUserOption(o => o.setName("user").setDescription("Select a user").setRequired(true)),
    new SlashCommandBuilder().setName("revokekey").setDescription("Revoke a user's key").addUserOption(o => o.setName("user").setDescription("Select a user").setRequired(true)),
    new SlashCommandBuilder().setName("get_script").setDescription("Get your personal script (after redeem)"),
    new SlashCommandBuilder().setName("addkey").setDescription("Add a new key to the system").addStringOption(o => o.setName("key").setDescription("The key to add").setRequired(true)),
    new SlashCommandBuilder().setName("redeem").setDescription("Redeem a key for yourself or another user (Owner only)").addStringOption(o => o.setName("key").setDescription("The key to redeem").setRequired(true)).addUserOption(o => o.setName("user").setDescription("Select a user (optional, owner only)").setRequired(false)),
    new SlashCommandBuilder().setName("keys").setDescription("Show all available keys (unused only)")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);
(async () => {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("✔ Slash commands loaded.");
})();

// ---------- INTERACTIONS ----------
client.on("interactionCreate", async interaction => {
    if (interaction.isChatInputCommand()) {
        const redeemed = loadRedeemedKeys();
        const keys = loadKeys();

        // ---------- SCRIPT PANEL ----------
        if (interaction.commandName === "script_panel") {
            if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: "❌ Only the owner can open this panel.", ephemeral: true });
            const banner = new AttachmentBuilder("./assets/banner.png");
            const thumb = new AttachmentBuilder("./assets/thumb.png");
            const embed = new EmbedBuilder()
                .setTitle("💜 Aethra | Script Access Panel")
                .setDescription("Welcome! Use the buttons below to manage your script access.\n\n🔑 Redeem Key → Activate your purchased key.\n📜 Get Script → Retrieve your personal script after key activation.\n\n> If you need help, please contact staff.")
                .setColor("#9b4dff")
                .setImage("attachment://banner.png")
                .setThumbnail("attachment://thumb.png")
                .setFooter({ text: "Aethra Script System © 2025" })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("get_script").setLabel("Get Script").setStyle(ButtonStyle.Secondary).setEmoji("📜"),
                new ButtonBuilder().setCustomId("redeem_key_modal").setLabel("Redeem Key").setStyle(ButtonStyle.Success).setEmoji("🔑")
            );

            await interaction.channel.send({ embeds: [embed], components: [row], files: [banner, thumb] });
            return interaction.reply({ content: "✅ Script Panel opened successfully!", ephemeral: true });
        }

        // ---------- USERINFO ----------
        if (interaction.commandName === "userinfo") {
            const user = interaction.options.getUser("user");
            const member = await interaction.guild.members.fetch(user.id).catch(() => null);
            const userKey = redeemed[user.id] || "Kullanılmamış";
            const embed = new EmbedBuilder()
                .setTitle(`📌 User Info — ${user.tag}`)
                .setColor("#9b4dff")
                .setThumbnail(user.displayAvatarURL({ size: 1024 }))
                .addFields(
                    { name: "🆔 User ID", value: `\`${user.id}\``, inline: true },
                    { name: "🎭 Buyer Role", value: member?.roles.cache.has(BUYER_ROLE_ID) ? "✔ Yes" : "❌ No", inline: true },
                    { name: "🔑 User Key", value: `\`${userKey}\``, inline: false },
                    { name: "📅 Discord Join", value: `<t:${Math.floor(user.createdTimestamp/1000)}:R>`, inline: true },
                    { name: "📅 Server Join", value: member ? `<t:${Math.floor(member.joinedTimestamp/1000)}:R>` : "Not in server", inline: true }
                )
                .setFooter({ text: "Aethra User Info System" })
                .setTimestamp();
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // ---------- REVOKE KEY ----------
        if (interaction.commandName === "revokekey") {
            const targetUser = interaction.options.getUser("user");
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            const keysPath = "./keys.txt";
            let keysFile = fs.existsSync(keysPath) ? fs.readFileSync(keysPath, "utf8").split(/\r?\n/).map(k => k.trim()).filter(k => k.length > 0) : [];
            const userKey = redeemed[targetUser.id];
            if (!userKey) return interaction.reply({ content: "❌ This user has no active key.", ephemeral: true });
            keysFile = keysFile.filter(k => k !== userKey);
            fs.writeFileSync(keysPath, keysFile.join("\n"), "utf8");
            delete redeemed[targetUser.id];
            saveRedeemedKeys(redeemed);
            if (member && member.roles.cache.has(BUYER_ROLE_ID)) await member.roles.remove(BUYER_ROLE_ID).catch(() => {});
            const embed = new EmbedBuilder()
                .setTitle("🔑 Key Revoked Successfully")
                .setColor("#ff4d4d")
                .setDescription(`**${targetUser.tag}**'s key has been revoked.\n🗑️ **Deleted Key:** \`${userKey}\`\n🎭 **Buyer Role:** Removed`)
                .setFooter({ text: "Aethra Key System" })
                .setTimestamp();
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // ---------- GET SCRIPT ----------
        if (interaction.commandName === "get_script") {
            const userId = interaction.user.id;
            if (!redeemed[userId]) return interaction.reply({ content: "❌ You need to redeem a key first!", ephemeral: true });
            const script = `script_key="${redeemed[userId]}"\nloadstring(game:HttpGet("https://pastebin.com/raw/EAKCqKag"))()`;
            return interaction.reply({ content: `💠 Your personal script:\n\`\`\`lua\n${script}\n\`\`\``, ephemeral: true });
        }

        // ---------- ADD KEY ----------
        if (interaction.commandName === "addkey") {
            if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: "❌ Only the owner can add keys.", ephemeral: true });
            const newKey = interaction.options.getString("key").trim();
            if (!newKey) return interaction.reply({ content: "❌ You must provide a key.", ephemeral: true });
            const keysPath = "./keys.txt";
            let keysFile = fs.existsSync(keysPath) ? fs.readFileSync(keysPath, "utf8").split(/\r?\n/).map(k => k.trim()).filter(k => k.length > 0) : [];
            if (keysFile.includes(newKey)) return interaction.reply({ content: "⚠️ This key already exists.", ephemeral: true });
            keysFile.push(newKey);
            fs.writeFileSync(keysPath, keysFile.join("\n"), "utf8");
            return interaction.reply({ content: `✅ Key \`${newKey}\` added successfully!`, ephemeral: true });
        }

        // ---------- REDEEM ----------
        if (interaction.commandName === "redeem") {
            const key = interaction.options.getString("key").trim();
            const targetUser = interaction.options.getUser("user") || interaction.user;
            if (targetUser.id !== interaction.user.id && interaction.user.id !== OWNER_ID) return interaction.reply({ content: "❌ You can only redeem keys for yourself.", ephemeral: true });
            if (!keys.includes(key)) return interaction.reply({ content: "❌ Invalid key.", ephemeral: true });
            if (Object.values(redeemed).includes(key)) return interaction.reply({ content: "❌ Key already used.", ephemeral: true });
            if (redeemed[targetUser.id]) return interaction.reply({ content: "❌ This user has already redeemed a key.", ephemeral: true });
            redeemed[targetUser.id] = key;
            saveRedeemedKeys(redeemed);
            try { const guild = client.guilds.cache.get(GUILD_ID); const member = await guild.members.fetch(targetUser.id); await member.roles.add(BUYER_ROLE_ID); } catch {}
            return interaction.reply({ content: `✅ Key \`${key}\` redeemed successfully for ${targetUser.tag}!`, ephemeral: true });
        }

        // ---------- SHOW UNUSED KEYS ----------
        if (interaction.commandName === "keys") {
            const usedKeys = Object.values(redeemed);
            const availableKeys = keys.filter(k => !usedKeys.includes(k));
            if (availableKeys.length === 0) return interaction.reply({ content: "⚠️ No available keys.", ephemeral: true });
            return interaction.reply({ content: `💠 Available Keys:\n\`\`\`\n${availableKeys.join("\n")}\n\`\`\``, ephemeral: true });
        }
    }

    // ---------- BUTTONS & MODALS ----------
    if (!interaction.isButton() && !interaction.isModalSubmit()) return;

    if (interaction.isButton() && interaction.customId === "redeem_key_modal") {
        const modal = new ModalBuilder().setCustomId("submit_redeem_key").setTitle("Redeem Script Key");
        const input = new TextInputBuilder().setCustomId("redeem_key").setLabel("Enter Your Key").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === "submit_redeem_key") {
        const redeemKey = interaction.fields.getTextInputValue("redeem_key");
        const redeemed = loadRedeemedKeys();
        const keys = loadKeys();
        const userId = interaction.user.id;
        if (redeemed[userId]) return interaction.reply({ content: "❌ Already redeemed.", ephemeral: true });
        if (!keys.includes(redeemKey)) return interaction.reply({ content: "❌ Invalid key.", ephemeral: true });
        if (Object.values(redeemed).includes(redeemKey)) return interaction.reply({ content: "❌ Key already used.", ephemeral: true });
        redeemed[userId] = redeemKey;
        saveRedeemedKeys(redeemed);
        try { const guild = client.guilds.cache.get(GUILD_ID); const member = await guild.members.fetch(userId); await member.roles.add(BUYER_ROLE_ID); } catch {}
        return interaction.reply({ content: "✅ Key redeemed successfully!", ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId === "get_script") {
        const userId = interaction.user.id;
        const redeemed = loadRedeemedKeys();
        if (!redeemed[userId]) return interaction.reply({ content: "❌ You need to redeem a key first!", ephemeral: true });
        const script = `script_key="${redeemed[userId]}"\nloadstring(game:HttpGet("https://pastebin.com/raw/EAKCqKag"))()`;
        return interaction.reply({ content: `💠 Your personal script:\n\`\`\`lua\n${script}\n\`\`\``, ephemeral: true });
    }
});

client.login(TOKEN);
