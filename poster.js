const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType,
} = require("discord.js");
const { postGuidePanel } = require("./guide");

// Tracks what each admin selected in step 1 (what to post)
const pendingPosts = {};

// ─── Step 1 result — admin picked WHAT to post ────────────────────────────────
async function handlePostWhatSelect(interaction) {
  if (interaction.customId !== "post_select_what") return false;

  const what = interaction.values[0];
  pendingPosts[interaction.user.id] = { what };

  // Build channel list from the guild — text channels only
  const channels = interaction.guild.channels.cache
    .filter((c) => c.type === ChannelType.GuildText)
    .sort((a, b) => a.position - b.position)
    .first(25); // Discord max 25 options

  if (!channels.size) {
    await interaction.update({ content: "❌ No text channels found.", components: [] });
    return true;
  }

  const options = channels.map((c) => ({
    label: `# ${c.name}`,
    description: c.parent ? `In: ${c.parent.name}` : "No category",
    value: c.id,
  }));

  const selectWhere = new StringSelectMenuBuilder()
    .setCustomId("post_select_where")
    .setPlaceholder("Which channel?")
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(selectWhere);

  const labels = {
    guide:         "📖 SCUM Player Guide",
    rules:         "📋 Server Rules",
    assistant_on:  "🤖 Enable Assistant Mode",
    assistant_off: "🔇 Disable Assistant Mode",
    announce:      "📣 Announcement",
  };

  await interaction.update({
    content: `**Step 2 — Where do you want to post the ${labels[what] || what}?**`,
    components: [row],
  });

  return true;
}

// ─── Step 2 result — admin picked WHERE to post ───────────────────────────────
async function handlePostWhereSelect(interaction, liveRules) {
  if (interaction.customId !== "post_select_where") return false;

  const pending = pendingPosts[interaction.user.id];
  if (!pending) {
    await interaction.update({ content: "❌ Session expired. Type `!post` again.", components: [] });
    return true;
  }

  const channelId = interaction.values[0];
  const targetChannel = interaction.guild.channels.cache.get(channelId);

  if (!targetChannel) {
    await interaction.update({ content: "❌ Channel not found.", components: [] });
    return true;
  }

  pending.channelId = channelId;

  // Show confirm button
  const labels = {
    guide:         "📖 SCUM Player Guide",
    rules:         "📋 Server Rules",
    assistant_on:  "🤖 Enable Assistant Mode",
    assistant_off: "🔇 Disable Assistant Mode",
    announce:      "📣 Announcement",
  };

  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("post_confirm")
      .setLabel(`Post ${labels[pending.what] || pending.what} to #${targetChannel.name}`)
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅"),
    new ButtonBuilder()
      .setCustomId("post_cancel")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger)
  );

  await interaction.update({
    content: `**Step 3 — Confirm**\n\nPost **${labels[pending.what]}** to <#${channelId}>?`,
    components: [confirmRow],
  });

  return true;
}

// ─── Step 3 — Confirm button ──────────────────────────────────────────────────
async function handlePostConfirm(interaction, liveRules, genAI, enabledChannels, supabase) {
  if (interaction.customId !== "post_confirm") return false;

  const pending = pendingPosts[interaction.user.id];
  if (!pending) {
    await interaction.update({ content: "❌ Session expired. Type `!post` again.", components: [] });
    return true;
  }

  const targetChannel = interaction.guild.channels.cache.get(pending.channelId);
  if (!targetChannel) {
    await interaction.update({ content: "❌ Channel not found.", components: [] });
    return true;
  }

  // Announce — don't delete pending yet, wait for their next message
  if (pending.what === "announce") {
    pending.waitingForAnnouncement = true;
    await interaction.update({
      content: `📣 **Type your announcement now.**

Post it in this channel and Mrs. Cobble will format and send it to <#${targetChannel.id}>.

_Just type your message — she'll handle the rest._`,
      components: [],
    });
    return true;
  }

  delete pendingPosts[interaction.user.id];

  try {
    if (pending.what === "guide") {
      await postGuidePanel(targetChannel);
      await interaction.update({ content: `✅ **SCUM Player Guide** posted in <#${targetChannel.id}>`, components: [] });

    } else if (pending.what === "rules") {
      await postRules(targetChannel, liveRules);
      await interaction.update({ content: `✅ **Server Rules** posted in <#${targetChannel.id}>`, components: [] });

    } else if (pending.what === "assistant_on") {
      enabledChannels.add(targetChannel.id);
      try {
        await supabase.from("assistant_channels").upsert({ channel_id: targetChannel.id }, { onConflict: "channel_id" });
      } catch (e) { console.error("Supabase error:", e.message); }
      await interaction.update({ content: `✅ **Assistant Mode enabled** in <#${targetChannel.id}>. She will now answer rule questions and do sass there.`, components: [] });

    } else if (pending.what === "assistant_off") {
      enabledChannels.delete(targetChannel.id);
      try {
        await supabase.from("assistant_channels").delete().eq("channel_id", targetChannel.id);
      } catch (e) { console.error("Supabase error:", e.message); }
      await interaction.update({ content: `✅ **Assistant Mode disabled** in <#${targetChannel.id}>. She will be silent there.`, components: [] });

    } else {
      await interaction.update({ content: "❌ Unknown post type.", components: [] });
    }
  } catch (err) {
    console.error("Post error:", err.message);
    await interaction.update({ content: `❌ Error: ${err.message}`, components: [] });
  }

  return true;
}

// ─── Cancel button ────────────────────────────────────────────────────────────
async function handlePostCancel(interaction) {
  if (interaction.customId !== "post_cancel") return false;
  delete pendingPosts[interaction.user.id];
  await interaction.update({ content: "❌ Cancelled.", components: [] });
  return true;
}

// ─── Post rules ───────────────────────────────────────────────────────────────
async function postRules(channel, liveRules) {
  const sections = [
    { key: "server",   emoji: "📡", color: 0x60a5fa },
    { key: "general",  emoji: "📋", color: 0xc8a04a },
    { key: "pvp",      emoji: "⚔️",  color: 0xef4444 },
    { key: "base",     emoji: "🏗️",  color: 0xf59e0b },
    { key: "vehicles", emoji: "🚗",  color: 0x8b5cf6 },
    { key: "shops",    emoji: "🏪",  color: 0x22c55e },
    { key: "map",      emoji: "🗺️",  color: 0x3b82f6 },
  ];

  // Header
  await channel.send({
    embeds: [new EmbedBuilder()
      .setTitle("📜 Cobblestone Server Rules")
      .setDescription("Welcome to Cobblestone. Our goal is to keep the game fun, fair, and enjoyable for everyone.\n\nAll bans include a discussion with the player before action is finalized.\n\n**18+ ONLY SERVER**")
      .setColor(0xc8a04a)
      .setFooter({ text: "Cobblestone SCUM Server • Rules" })]
  });

  // One embed per section
  for (const s of sections) {
    const content = liveRules[s.key];
    if (!content) continue;
    const lines = content.split("\n");
    const title = lines[0]; // First line is the section title
    const body  = lines.slice(1).join("\n").trim();

    const embed = new EmbedBuilder()
      .setTitle(`${s.emoji} ${title}`)
      .setDescription(body || content)
      .setColor(s.color);

    await channel.send({ embeds: [embed] });
    await new Promise((r) => setTimeout(r, 400));
  }
}

module.exports = {
  handlePostWhatSelect,
  handlePostWhereSelect,
  handlePostConfirm,
  handlePostCancel,
};

// ─── Handle announcement text from admin after confirm ────────────────────────
async function handleAnnouncementText(message, genAI, enabledChannels) {
  // Find a pending announcement for this user
  const pending = pendingPosts[message.author.id];
  if (!pending || !pending.waitingForAnnouncement) return false;

  const targetChannel = message.guild?.channels.cache.get(pending.channelId);
  if (!targetChannel) {
    delete pendingPosts[message.author.id];
    await message.reply("❌ Target channel not found. Type `!post` to start again.");
    return true;
  }

  delete pendingPosts[message.author.id];

  // Show typing indicator
  const thinking = await message.reply("✍️ Formatting your announcement...");

  try {
    // Use Gemini to format the announcement
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = [
      "You are formatting a Discord server announcement for the Cobblestone SCUM server.",
      "An admin typed this raw announcement text:",
      message.content,
      "",
      "Format it as a clean, professional Discord announcement. Return ONLY a JSON object with these fields:",
      '{ "title": "short punchy title", "body": "formatted announcement body with line breaks where appropriate", "footer": "short footer note if relevant, or empty string" }',
      "",
      "Rules:",
      "- Title should be short and descriptive (max 60 chars)",
      "- Body should be clean and easy to read — use line breaks, bold key info with **text**",
      "- Keep the original meaning exactly — do not add info that wasn't there",
      "- Do not use emojis unless the admin used them",
      "- Output ONLY the JSON, no explanation, no markdown code blocks"
    ].join("\n");

    const result = await model.generateContent(prompt);
    let raw = result.response.text().trim();
    raw = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(raw);

    const { EmbedBuilder } = require("discord.js");
    const embed = new EmbedBuilder()
      .setTitle(`📣 ${parsed.title}`)
      .setDescription(parsed.body)
      .setColor(0xc8a04a)
      .setTimestamp();

    if (parsed.footer) {
      embed.setFooter({ text: parsed.footer });
    }

    await targetChannel.send({ embeds: [embed] });
    await thinking.edit(`✅ Announcement posted in <#${targetChannel.id}>.`);

  } catch (err) {
    console.error("Announce error:", err.message);
    await thinking.edit(`❌ Error formatting announcement: ${err.message}`);
  }

  return true;
}

module.exports = {
  handlePostWhatSelect,
  handlePostWhereSelect,
  handlePostConfirm,
  handlePostCancel,
  handleAnnouncementText,
};
