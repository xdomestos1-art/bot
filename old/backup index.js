// index.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");
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

// ---------- CONFIG ----------
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const BUYER_ROLE_ID = process.env.BUYER_ROLE_ID;
const OWNER_ID = process.env.OWNER_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;

if (!TOKEN) console.warn("⚠️ TOKEN not set in .env");
if (!CLIENT_ID) console.warn("⚠️ CLIENT_ID not set in .env");
if (!GUILD_ID) console.warn("⚠️ GUILD_ID not set in .env");

// Use absolute paths to avoid PM2 cwd issues
const KEYS_PATH = path.join(__dirname, "keys.txt");
const REDEEMED_PATH = path.join(__dirname, "redeemedKeys.json");

// Ensure files exist
if (!fs.existsSync(KEYS_PATH)) fs.writeFileSync(KEYS_PATH, "", "utf8");
if (!fs.existsSync(REDEEMED_PATH)) fs.writeFileSync(REDEEMED_PATH, "{}", "utf8");

// ---------- CLIENT ----------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ]
});

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
        if (!channel) {
            console.warn("Log channel not found or bot can't access it.");
            return;
        }
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(color)
            .setTimestamp();

        if (title === "🔁 Key Reset Request") {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("resetted_btn")
                    .setLabel("Resetted")
                    .setStyle(ButtonStyle.Success)
                    .setEmoji("✅")
            );
            await channel.send({ embeds: [embed], components: [row] });
        } else {
            await channel.send({ embeds: [embed] });
        }
    } catch (err) {
        console.error("Audit log failed:", err);
    }
}

// ---------- REGISTER SLASH COMMANDS ----------
const commands = [
    new SlashCommandBuilder().setName("script_panel").setDescription("Aethra Script Access Panel"),
    new SlashCommandBuilder().setName("userinfo").setDescription("Check a user's key & info")
        .addUserOption(o => o.setName("user").setDescription("Select a user").setRequired(true)),
    new SlashCommandBuilder().setName("revokekey").setDescription("Revoke a user's key")
        .addUserOption(o => o.setName("user").setDescription("Select a user").setRequired(true)),
    new SlashCommandBuilder().setName("get_script").setDescription("Get your personal script (after redeem)"),
    new SlashCommandBuilder().setName("addkey").setDescription("Add a new key to the system")
        .addStringOption(o => o.setName("key").setDescription("The key to add").setRequired(true)),
    new SlashCommandBuilder().setName("redeem").setDescription("Redeem a key for yourself or another user (Owner only)")
        .addStringOption(o => o.setName("key").setDescription("The key to redeem").setRequired(true))
        .addUserOption(o => o.setName("user").setDescription("Select a user (optional, owner only)").setRequired(false)),
    new SlashCommandBuilder().setName("keys").setDescription("Show all available keys (unused only)"),
    new SlashCommandBuilder().setName("usedkeys").setDescription("List all redeemed keys and their owners (Owner only)"),
    new SlashCommandBuilder().setName("deletekey").setDescription("Delete an unused key from the system (Owner only)")
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
    // --- Select menu handling (must be before button/modal checks) ---
    if (interaction.isStringSelectMenu() && interaction.customId === "delete_key_select") {
        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({ content: "❌ Only the owner can delete keys.", ephemeral: true });
        }

        const selectedKey = interaction.values[0];
        const keys = loadKeys();
        const updated = keys.filter(k => k !== selectedKey);
        try {
            fs.writeFileSync(KEYS_PATH, updated.join("\n"), "utf8");
        } catch (err) {
            console.error("Failed to write keys file:", err);
            return interaction.update({ content: "❌ Failed to delete key (fs error).", components: [] });
        }

        await logAction(client, "🗑️ Key Deleted", `${interaction.user.tag} deleted key: \`${selectedKey}\``, "#ff4d4d");

        return interaction.update({
            content: `🗑️ Key **${selectedKey}** deleted successfully.`,
            components: []
        });
    }

    // Chat input commands
    if (interaction.isChatInputCommand()) {
        const redeemed = loadRedeemedKeys();
        const keys = loadKeys();

        // ---------- SCRIPT PANEL ----------
        if (interaction.commandName === "script_panel") {
            if (interaction.user.id !== OWNER_ID)
                return interaction.reply({ content: "❌ Only the owner can open this panel.", ephemeral: true });

            const embed = new EmbedBuilder()
                .setTitle("💜 Aethra | Script Access Panel")
                .setDescription("Welcome! Use the buttons below to manage your script access.\n\n🔑 Redeem Key → Activate your purchased key.\n📜 Get Script → Retrieve your personal script after key activation.\n♻️ Reset Key → Request a key reset (for redeemed users only).\n\n> If you need help, please contact staff.")
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

        // ---------- USERINFO ----------
        if (interaction.commandName === "userinfo") {
            const user = interaction.options.getUser("user");
            const member = await interaction.guild.members.fetch(user.id).catch(() => null);
            const userKey = redeemed[user.id] || "None";
            const embed = new EmbedBuilder()
                .setTitle(`📌 User Info — ${user.tag}`)
                .setColor("#9b4dff")
                .addFields(
                    { name: "🆔 User ID", value: `\`${user.id}\``, inline: true },
                    { name: "🎭 Buyer Role", value: member?.roles.cache.has(BUYER_ROLE_ID) ? "✔ Yes" : "❌ No", inline: true },
                    { name: "🔑 User Key", value: `\`${userKey}\``, inline: false }
                )
                .setFooter({ text: "Aethra User Info System" })
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
            let keysFile = fs.existsSync(KEYS_PATH)
                ? fs.readFileSync(KEYS_PATH, "utf8").split(/\r?\n/).map(k => k.trim()).filter(k => k.length > 0)
                : [];
            if (keysFile.includes(newKey))
                return interaction.reply({ content: "⚠️ This key already exists.", ephemeral: true });
            keysFile.push(newKey);
            fs.writeFileSync(KEYS_PATH, keysFile.join("\n"), "utf8");
            await logAction(client, "➕ Key Added", `${interaction.user.tag} added new key: \`${newKey}\``);
            return interaction.reply({ content: `✅ Key \`${newKey}\` added successfully!`, ephemeral: true });
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

            const usedKeys = Object.values(redeemed);
            const available = keys.filter(k => !usedKeys.includes(k));

            if (available.length === 0)
                return interaction.reply({ content: "⚠️ No unused keys available.", ephemeral: true });

            const menu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId("delete_key_select")
                    .setPlaceholder("Select a key to delete")
                    .addOptions(
                        available.map(k => ({
                            label: k.length > 100 ? k.slice(0, 97) + "..." : k, // label char limit safe-guard
                            value: k
                        }))
                    )
            );

            return interaction.reply({
                content: "🗑️ **Select a key to delete:**",
                components: [menu],
                ephemeral: true
            });
        }
    } // end isChatInputCommand

    // ---------- BUTTONS & MODALS ----------
    if (!interaction.isButton() && !interaction.isModalSubmit()) return;

    // Redeem Modal (open)
    if (interaction.isButton() && interaction.customId === "redeem_key_modal") {
        const modal = new ModalBuilder().setCustomId("submit_redeem_key").setTitle("Redeem Script Key");
        const input = new TextInputBuilder().setCustomId("redeem_key").setLabel("Enter Your Key").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
    }

    // Redeem Modal Submit
    if (interaction.isModalSubmit() && interaction.customId === "submit_redeem_key") {
        const redeemKey = interaction.fields.getTextInputValue("redeem_key").trim();
        const redeemed = loadRedeemedKeys();
        const keys = loadKeys();
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
        await logAction(client, "🔑 Key Redeemed (Modal)", `${interaction.user.tag} redeemed key \`${redeemKey}\` via modal.`, "#4dff88");
        return interaction.reply({ content: "✅ Key redeemed successfully!", ephemeral: true });
    }

    // Reset Key Button (open modal)
    if (interaction.isButton() && interaction.customId === "reset_key_modal") {
        const redeemed = loadRedeemedKeys();
        if (!redeemed[interaction.user.id])
            return interaction.reply({ content: "❌ You need to have a redeemed key to use this.", ephemeral: true });

        const modal = new ModalBuilder()
            .setCustomId("submit_reset_key")
            .setTitle("Reset Key Request");

        const input = new TextInputBuilder()
            .setCustomId("reset_target_name")
            .setLabel("Enter new username")
            .setPlaceholder("Example: NewUser123")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
    }

    // Reset Key Modal Submit
    if (interaction.isModalSubmit() && interaction.customId === "submit_reset_key") {
        const redeemed = loadRedeemedKeys();
        const userId = interaction.user.id;
        if (!redeemed[userId])
            return interaction.reply({ content: "❌ You do not have a redeemed key.", ephemeral: true });

        const newName = interaction.fields.getTextInputValue("reset_target_name").trim();
        const userKey = redeemed[userId];

        await logAction(
            client,
            "🔁 Key Reset Request",
            `${interaction.user.tag} requested key reset for **${newName}**.\n🔑 Key: \`${userKey}\``,
            "#ffaa00"
        );

        return interaction.reply({ content: `✅ Key reset request logged for **${newName}**.`, ephemeral: true });
    }

    // Resetted Button
    if (interaction.isButton() && interaction.customId === "resetted_btn") {
        if (interaction.user.id !== OWNER_ID)
            return interaction.reply({ content: "❌ Only the owner can confirm reset.", ephemeral: true });

        const embed = interaction.message.embeds[0];
        if (!embed) return interaction.reply({ content: "❌ No embed found.", ephemeral: true });

        const desc = embed.description || "";
        const match = desc.match(/^(.*?) requested key reset/);
        if (!match) return interaction.reply({ content: "❌ Could not parse user from log.", ephemeral: true });

        const requesterTag = match[1].trim();
        const guild = client.guilds.cache.get(GUILD_ID);
        const member = guild.members.cache.find(m => m.user.tag === requesterTag);

        if (member) {
            try {
                await member.send("💠 Your key has been reset successfully!");
            } catch {
                await interaction.reply({ content: "⚠️ Couldn't DM the user.", ephemeral: true });
            }
        }

        const updatedEmbed = EmbedBuilder.from(embed)
            .setColor("#4dff88")
            .setFooter({ text: `✅ Key reset confirmed by ${interaction.user.tag}` });

        const disabledRow = new ActionRowBuilder().addComponents(
            ButtonBuilder.from(interaction.component).setDisabled(true)
        );

        await interaction.update({ embeds: [updatedEmbed], components: [disabledRow] });

        await logAction(
            client,
            "✅ Key Reset Confirmed",
            `${interaction.user.tag} confirmed key reset for ${requesterTag}.`,
            "#4dff88"
        );
    }

    // Get Script Button
    if (interaction.isButton() && interaction.customId === "get_script") {
        const redeemed = loadRedeemedKeys();
        const userId = interaction.user.id;
        if (!redeemed[userId])
            return interaction.reply({ content: "❌ You need to redeem a key first!", ephemeral: true });
        const script = `script_key="${redeemed[userId]}"\nloadstring(game:HttpGet("https://pastebin.com/raw/EAKCqKag"))()`;
        return interaction.reply({ content: `💠 Your personal script:\n\`\`\`lua\n${script}\n\`\`\``, ephemeral: true });
    }
}); // end interactionCreate

client.once("ready", () => {
    console.log(`Logged in as ${client.user.tag}`);
});
client.login(TOKEN);
