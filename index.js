// index.js
require("dotenv").config();
const express = require("express");
const app = express();
const fs = require("fs");
const path = require("path");
const cooldowns = new Map();
const { Octokit } = require("@octokit/rest");
const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    REST,
    Routes,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder
} = require("discord.js");


app.get("/", (req, res) => res.send("Bot is alive"));
app.listen(process.env.PORT || 3000, () => console.log("Uptime server running"));

// ---------- CONFIG ----------
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const BUYER_ROLE_ID = process.env.BUYER_ROLE_ID;
const OWNER_ID = process.env.OWNER_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER;
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME;
const GITHUB_KEYS_PATH = process.env.GITHUB_KEYS_PATH;

if (!TOKEN) console.warn("⚠️ TOKEN not set in .env");
if (!CLIENT_ID) console.warn("⚠️ CLIENT_ID not set in .env");

const KEYS_PATH = path.join(__dirname, "keys.txt");
const REDEEMED_PATH = path.join(__dirname, "redeemedKeys.json");

if (!fs.existsSync(KEYS_PATH)) fs.writeFileSync(KEYS_PATH, "", "utf8");
if (!fs.existsSync(REDEEMED_PATH)) fs.writeFileSync(REDEEMED_PATH, "{}", "utf8");

// ---------- GITHUB ----------
const octokit = new Octokit({ auth: GITHUB_TOKEN });

async function loadGitHubKeys() {
    try {
        const { data } = await octokit.repos.getContent({
            owner: GITHUB_REPO_OWNER,
            repo: GITHUB_REPO_NAME,
            path: GITHUB_KEYS_PATH
        });
        const content = Buffer.from(data.content, 'base64').toString();
        return JSON.parse(content);
    } catch (err) {
        console.error("GitHub load error:", err);
        return {};
    }
}

async function saveGitHubKeys(obj, message) {
    try {
        const { data: currentData } = await octokit.repos.getContent({
            owner: GITHUB_REPO_OWNER,
            repo: GITHUB_REPO_NAME,
            path: GITHUB_KEYS_PATH
        });
        await octokit.repos.createOrUpdateFileContents({
            owner: GITHUB_REPO_OWNER,
            repo: GITHUB_REPO_NAME,
            path: GITHUB_KEYS_PATH,
            message,
            content: Buffer.from(JSON.stringify(obj, null, 4)).toString('base64'),
            sha: currentData.sha
        });
    } catch (err) {
        console.error("GitHub save error:", err);
        throw err;
    }
}

// ---------- HELPERS ----------
function loadKeys() {
    try {
        return fs.readFileSync(KEYS_PATH, "utf8")
            .split(/\r?\n/)
            .map(k => k.trim())
            .filter(k => k.length > 0);
    } catch (err) {
        console.error("loadKeys error:", err);
        return [];
    }
}

function loadRedeemedKeys() {
    try {
        return JSON.parse(fs.readFileSync(REDEEMED_PATH, "utf8"));
    } catch (err) {
        console.error("loadRedeemedKeys error:", err);
        return {};
    }
}

function saveRedeemedKeys(data) {
    try {
        fs.writeFileSync(REDEEMED_PATH, JSON.stringify(data, null, 4), "utf8");
    } catch (err) {
        console.error("saveRedeemedKeys error:", err);
    }
}

async function logAction(client, title, description, color = "#9b4dff") {
    try {
        const channel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
        if (!channel) return;
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(color)
            .setTimestamp();
        await channel.send({ embeds: [embed] });
    } catch (err) {
        console.error("Audit log failed:", err);
    }
}

// ---------- ADD / DELETE KEY HELPER ----------
async function addKey(newKey, robloxUser) {
    // local txt (sadece key)
    let keys = fs.existsSync(KEYS_PATH)
        ? fs.readFileSync(KEYS_PATH, "utf8").split(/\r?\n/).filter(k => k)
        : [];
    if (keys.includes(newKey)) return false;
    keys.push(newKey);
    fs.writeFileSync(KEYS_PATH, keys.join("\n"), "utf8");

    // github (key: "robloxUser")
    const ghKeys = await loadGitHubKeys();
    ghKeys[newKey] = robloxUser; // burada null yerine girilen kullanıcı adı
    await saveGitHubKeys(ghKeys, `Add key ${newKey} for user ${robloxUser}`);

    return true;
}

async function deleteKey(targetKey) {
    // local txt
    let keys = fs.existsSync(KEYS_PATH)
        ? fs.readFileSync(KEYS_PATH, "utf8").split(/\r?\n/).filter(k => k)
        : [];
    keys = keys.filter(k => k !== targetKey);
    fs.writeFileSync(KEYS_PATH, keys.join("\n"), "utf8");

    // github
    const ghKeys = await loadGitHubKeys();
    delete ghKeys[targetKey];
    await saveGitHubKeys(ghKeys, `Delete key ${targetKey}`);
}

// ---------- CLIENT ----------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ]
});

// ---------- SLASH COMMANDS ----------
const commands = [
    new SlashCommandBuilder().setName("generate").setDescription("Generate a random Aethra code"),
    new SlashCommandBuilder().setName("script_panel").setDescription("Aethra Script Access Panel"),
    new SlashCommandBuilder().setName("userinfo").setDescription("Check a user's key & info").addUserOption(o => o.setName("user").setDescription("Select a user").setRequired(true)),
    new SlashCommandBuilder().setName("revokekey").setDescription("Revoke a user's key").addUserOption(o => o.setName("user").setDescription("Select a user").setRequired(true)),
    new SlashCommandBuilder().setName("get_script").setDescription("Get your personal script (after redeem)"),
    new SlashCommandBuilder().setName("addkey").setDescription("Add a new key with Roblox user").addStringOption(o => o.setName("key").setDescription("The key to add").setRequired(true)).addStringOption(o => o.setName("roblox_user").setDescription("Roblox username for this key").setRequired(true)),
    new SlashCommandBuilder().setName("redeem").setDescription("Redeem a key for yourself or another user (Owner only)").addStringOption(o => o.setName("key").setDescription("The key to redeem").setRequired(true)).addUserOption(o => o.setName("user").setDescription("Select a user (optional, owner only)").setRequired(false)),
    new SlashCommandBuilder().setName("keys").setDescription("Show all available keys (unused only)"),
    new SlashCommandBuilder().setName("usedkeys").setDescription("List all redeemed keys and their owners (Owner only)"),
    new SlashCommandBuilder().setName("deletekey").setDescription("Delete a key").addStringOption(o => o.setName("key").setDescription("The key to delete").setRequired(true)),
    new SlashCommandBuilder().setName("updatekey").setDescription("Update the Roblox username for an existing key").addStringOption(o => o.setName("key").setDescription("The key to update").setRequired(true)).addStringOption(o => o.setName("roblox_user").setDescription("New Roblox username").setRequired(true))
].map(c => c.toJSON());


const rest = new REST({ version: "10" }).setToken(TOKEN);
(async () => {
    try {
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
        console.log("✔ Slash commands loaded.");
    } catch (err) {
        console.error("Failed to register commands:", err);
    }
})();

// ---------- INTERACTIONS ----------
client.on("interactionCreate", async (interaction) => {
    const redeemed = loadRedeemedKeys();
    const keys = loadKeys();

    // ---------- SELECT MENU ----------
    if (interaction.isStringSelectMenu() && interaction.customId === "delete_key_select") {
        if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: "❌ Only the owner can delete keys.", ephemeral: true });
        const selectedKey = interaction.values[0];
        await deleteKey(selectedKey);
        await logAction(client, "🗑️ Key Deleted", `${interaction.user.tag} deleted key: ${selectedKey}`);
        return interaction.update({ content: `🗑️ Key **${selectedKey}** deleted successfully.`, components: [] });
    }

    if (interaction.isChatInputCommand()) {
        // ---------- SCRIPT PANEL ----------
        if (interaction.commandName === "script_panel") {
            if (interaction.user.id !== OWNER_ID)
                return interaction.reply({ content: "❌ Only the owner can open this panel.", ephemeral: true });

            const embed = new EmbedBuilder()
                .setTitle("💜 Aethra | Script Access Panel")
                .setDescription("Welcome! Use the buttons below to manage your script access.\n\n🔑 Redeem Key → Activate your purchased key.\n📜 Get Script → Retrieve your personal script after key activation.\n♻️ Reset Key →/2H Cooldown.\n\n> If you need help, please contact staff.")
                .setColor("#9b4dff")
                .setFooter({ text: "Aethra Script System © 2025" })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("get_script").setLabel("Get Script").setStyle(ButtonStyle.Secondary).setEmoji("📜"),
                new ButtonBuilder().setCustomId("redeem_key_modal").setLabel("Redeem Key").setStyle(ButtonStyle.Success).setEmoji("🔑"),
                new ButtonBuilder().setCustomId("reset_key_modal").setLabel("Reset Key").setStyle(ButtonStyle.Danger).setEmoji("♻️")
            );

            await interaction.channel.send({ embeds: [embed], components: [row] });
            await logAction(client, "📢 Script Panel Opened", `Owner ${interaction.user.tag} opened the Script Panel.`);
            return interaction.reply({ content: "✅ Script Panel opened successfully!", ephemeral: true });
        }

//updatekey
if (interaction.commandName === "updatekey") {
    if (interaction.user.id !== OWNER_ID)
        return interaction.reply({ content: "❌ Only the owner can update keys.", ephemeral: true });

    const key = interaction.options.getString("key").trim();
    const newRobloxUser = interaction.options.getString("roblox_user").trim();

    await interaction.deferReply({ ephemeral: true });

    try {
        const ghKeys = await loadGitHubKeys();
        if (!ghKeys[key]) return interaction.editReply({ content: "❌ No key found in Database" });

        ghKeys[key] = newRobloxUser; // sadece GitHub'daki eşleşmeyi değiştir
        await saveGitHubKeys(ghKeys, `Update key ${key} Roblox username to ${newRobloxUser}`);

        await logAction(client, "🔄 Key Updated", `${interaction.user.tag} updated key ${key} Roblox username to ${newRobloxUser}.`, "#00ccff");
        return interaction.editReply({ content: `✅ Key \`${key}\` updated successfully to Roblox user \`${newRobloxUser}\`.` });
    } catch (err) {
        console.error("UpdateKey error:", err);
        return interaction.editReply({ content: "❌ Failed to update key." });
    }
}

//--generate
if (interaction.isChatInputCommand() && interaction.commandName === "generate") {
    const makeRandom = length => {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let result = "";
        for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
        return result;
    };
    return interaction.reply({ content: `|Aethra|${makeRandom(16)}`, ephemeral: true });
}


// ---------- USERINFO ----------
if (interaction.commandName === "userinfo") {
    const user = interaction.options.getUser("user");
    const userKey = redeemed[user.id] || "None";

    let robloxUser = "None";
    if (userKey !== "None") {
        try {
            const ghKeys = await loadGitHubKeys();
            robloxUser = ghKeys[userKey] || "Not assigned";
        } catch (err) {
            console.error("Failed to load GitHub keys for userinfo:", err);
        }
    }

    const embed = new EmbedBuilder()
        .setTitle(`🔑 Key Info — ${user.tag}`)
        .setColor(userKey !== "None" ? "#4dff88" : "#ff4d4d") // yeşil kullanılmış key için, kırmızı yoksa
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setDescription(`**Key:** \`${userKey}\`\n**Roblox User:** \`${robloxUser}\``)
        .setFooter({ text: "Aethra Key Panel" })
        .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

        // ---------- REVOKE KEY ----------
        if (interaction.commandName === "revokekey") {
            const targetUser = interaction.options.getUser("user");
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            const userKey = redeemed[targetUser.id];
            if (!userKey)
                return interaction.reply({ content: "❌ This user has no active key.", ephemeral: true });

            delete redeemed[targetUser.id];
            saveRedeemedKeys(redeemed);

            if (member && member.roles.cache.has(BUYER_ROLE_ID))
                await member.roles.remove(BUYER_ROLE_ID).catch(() => { });

            const embed = new EmbedBuilder()
                .setTitle("🔑 Key Revoked Successfully")
                .setColor("#ff4d4d")
                .setDescription(`**${targetUser.tag}**'s key has been revoked.\n🗑️ **Deleted Key:** \`${userKey}\`\n🎭 **Buyer Role:** Removed`)
                .setTimestamp();

            await logAction(client, "🗑️ Key Revoked", `${interaction.user.tag} revoked ${targetUser.tag}'s key (\`${userKey}\`).`, "#ff4d4d");
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
    if (interaction.user.id !== OWNER_ID)
        return interaction.reply({ content: "❌ Only the owner can add keys.", ephemeral: true });

    const newKey = interaction.options.getString("key").trim();
    const robloxUser = interaction.options.getString("roblox_user").trim();
    await interaction.deferReply({ ephemeral: true });

    try {
        const success = await addKey(newKey, robloxUser);
        if (!success) return interaction.editReply({ content: "⚠️ This key already exists." });
        await logAction(client, "➕ Key Added", `${interaction.user.tag} added key ${newKey} for Roblox user ${robloxUser}`);
        return interaction.editReply({ content: `✅ Key \`${newKey}\` added successfully for Roblox user \`${robloxUser}\`!` });
    } catch {
        return interaction.editReply({ content: "❌ Failed to add key." });
    }
}

        // ---------- REDEEM ----------
        if (interaction.commandName === "redeem") {
            const key = interaction.options.getString("key").trim();
            const targetUser = interaction.options.getUser("user") || interaction.user;
            if (targetUser.id !== interaction.user.id && interaction.user.id !== OWNER_ID)
                return interaction.reply({ content: "❌ You can only redeem keys for yourself.", ephemeral: true });
            if (!keys.includes(key))
                return interaction.reply({ content: "❌ Invalid key.", ephemeral: true });
            if (Object.values(redeemed).includes(key))
                return interaction.reply({ content: "❌ Key already used.", ephemeral: true });
            if (redeemed[targetUser.id])
                return interaction.reply({ content: "❌ This user has already redeemed a key.", ephemeral: true });
            redeemed[targetUser.id] = key;
            saveRedeemedKeys(redeemed);
            try {
                const guild = client.guilds.cache.get(GUILD_ID);
                const member = await guild.members.fetch(targetUser.id);
                await member.roles.add(BUYER_ROLE_ID);
            } catch { }
            await logAction(client, "🔑 Key Redeemed", `${interaction.user.tag} redeemed key \`${key}\` for ${targetUser.tag}.`, "#4dff88");
            return interaction.reply({ content: `✅ Key \`${key}\` redeemed successfully for ${targetUser.tag}!`, ephemeral: true });
        }

        // ---------- KEYS ----------
        if (interaction.commandName === "keys") {
            const usedKeys = Object.values(redeemed);
            const available = keys.filter(k => !usedKeys.includes(k));
            if (available.length === 0)
                return interaction.reply({ content: "⚠️ No available keys.", ephemeral: true });
            return interaction.reply({ content: `💠 Available Keys:\n\`\`\`\n${available.join("\n")}\n\`\`\``, ephemeral: true });
        }

        // ---------- USED KEYS ----------
        if (interaction.commandName === "usedkeys") {
            if (interaction.user.id !== OWNER_ID)
                return interaction.reply({ content: "❌ Only the owner can use this.", ephemeral: true });
            const entries = Object.entries(redeemed);
            if (entries.length === 0)
                return interaction.reply({ content: "⚠️ No redeemed keys yet.", ephemeral: true });
            const formatted = entries.map(([u, k]) => `👤 <@${u}> — \`${k}\``).join("\n");
            return interaction.reply({ content: `🔒 **Redeemed Keys:**\n${formatted}`, ephemeral: true });
        }

        // ---------- DELETE KEY ----------
        if (interaction.commandName === "deletekey") {
            if (interaction.user.id !== OWNER_ID)
                return interaction.reply({ content: "❌ Only the owner can delete keys.", ephemeral: true });

            const targetKey = interaction.options.getString("key").trim();
            await interaction.deferReply({ ephemeral: true });

            try {
                await deleteKey(targetKey);
                await logAction(client, "🗑️ Key Deleted", `${interaction.user.tag} deleted key ${targetKey}`);
                return interaction.editReply({ content: `🗑️ Key \`${targetKey}\` deleted successfully!` });
            } catch {
                return interaction.editReply({ content: "❌ Failed to delete key." });
            }
        }
    }

    // ---------- BUTTONS & MODALS ----------
    if (!interaction.isButton() && !interaction.isModalSubmit()) return;

    // Redeem Modal
    if (interaction.isButton() && interaction.customId === "redeem_key_modal") {
        const modal = new ModalBuilder().setCustomId("submit_redeem_key").setTitle("Redeem Script Key");
        const input = new TextInputBuilder().setCustomId("redeem_key").setLabel("Enter Your Key").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === "submit_redeem_key") {
        const redeemKey = interaction.fields.getTextInputValue("redeem_key").trim();
        const userId = interaction.user.id;
        if (redeemed[userId]) return interaction.reply({ content: "❌ Already redeemed.", ephemeral: true });
        if (!keys.includes(redeemKey)) return interaction.reply({ content: "❌ Invalid key.", ephemeral: true });
        if (Object.values(redeemed).includes(redeemKey)) return interaction.reply({ content: "❌ Key already used.", ephemeral: true });
        redeemed[userId] = redeemKey;
        saveRedeemedKeys(redeemed);
        try {
            const guild = client.guilds.cache.get(GUILD_ID);
            const member = await guild.members.fetch(userId);
            await member.roles.add(BUYER_ROLE_ID);
        } catch { }

        await logAction(client, "🔑 Key Redeemed (Modal)", `${interaction.user.tag} redeemed key \`${redeemKey}\`.`, "#4dff88");
        return interaction.reply({ content: `✅ Key \`${redeemKey}\` redeemed successfully!`, ephemeral: true });
    }

    // Get Script Button
    if (interaction.isButton() && interaction.customId === "get_script") {
        const userId = interaction.user.id;
        const userKey = redeemed[userId];
        if (!userKey) return interaction.reply({ content: "❌ You need to redeem a key first!", ephemeral: true });
        const script = `script_key="${userKey}"\nloadstring(game:HttpGet("https://pastebin.com/raw/EAKCqKag"))()`;
        return interaction.reply({ content: `💠 Your personal script:\n\`\`\`lua\n${script}\n\`\`\``, ephemeral: true });
    }


// ---------- RESET KEY (ROBLOX UPDATE) ----------
if (interaction.isButton() && interaction.customId === "reset_key_modal") {
    const userId = interaction.user.id;
    const userKey = redeemed[userId];

    if (!userKey) {
        return interaction.reply({ content: "❌ You don't have a key to update.", ephemeral: true });
    }

    const now = Date.now();
    const expireTime = cooldowns.get(userId) || 0;
    if (now < expireTime) {
        const remaining = Math.ceil((expireTime - now) / 1000 / 60);
        return interaction.reply({ content: `❌ You are on cooldown. Try again in ${remaining} minutes.`, ephemeral: true });
    }

    const modal = new ModalBuilder()
        .setCustomId("update_roblox_modal")
        .setTitle("Update Your Roblox Username");

    const input = new TextInputBuilder()
        .setCustomId("roblox_name")
        .setLabel("Enter your Roblox username")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
}

// Modal Submit
if (interaction.isModalSubmit() && interaction.customId === "update_roblox_modal") {
    const userId = interaction.user.id;
    const userKey = redeemed[userId];

    if (!userKey) {
        return interaction.reply({ content: "❌ You don't have a key to update.", ephemeral: true });
    }

    const now = Date.now();
    const expireTime = cooldowns.get(userId) || 0;
    if (now < expireTime) {
        return interaction.reply({ content: "❌ You are on cooldown. Try again later.", ephemeral: true });
    }

    const robloxName = interaction.fields.getTextInputValue("roblox_name").trim();

    await interaction.deferReply({ ephemeral: true });

    try {
        const ghKeys = await loadGitHubKeys();

        // Eğer GitHub'da key yoksa ekle
        if (!ghKeys[userKey]) {
            ghKeys[userKey] = robloxName;
            await saveGitHubKeys(ghKeys, `Add missing key ${userKey} for ${robloxName}`);
        } else {
            // Var ise sadece username güncelle
            ghKeys[userKey] = robloxName;
            await saveGitHubKeys(ghKeys, `Update key ${userKey} Roblox username to ${robloxName}`);
        }

        cooldowns.set(userId, now + 2 * 60 * 60 * 1000); // 2 saat cooldown

        await logAction(client, "♻️ Roblox Name Updated", `${interaction.user.tag} updated key ${userKey} with Roblox username ${robloxName}`, "#ffcc00");
        return interaction.editReply({ content: `✅ Your key \`${userKey}\` has been updated with Roblox username \`${robloxName}\`. You can update again in 2 hours.` });
    } catch (err) {
        console.error("Roblox update error:", err);
        return interaction.editReply({ content: "❌ Failed to update Roblox username." });
    }
}
});

// ---------- READY ----------
client.once("ready", () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.login(TOKEN);


