// ============================================================================
// EVENT HANDLER - Main entry point for event creation/management
// ============================================================================

const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { createEvent, getUpcomingEvents, updateEvent, deleteEvent, pauseEvent } = require("./event-db");

const pendingEvents = {};

// Handle event creation flow from !post menu
async function handleEventOption(interaction) {
  if (interaction.customId !== "post_select_what" || interaction.values[0] !== "create_event") {
    return false;
  }

  // Check if user has SCUM Admin, Sr. Admin, or Owner role
  const hasPermission = interaction.member.roles.cache.some(role => 
    ["SCUM Admin", "Sr. Admin", "Owner"].includes(role.name)
  );

  if (!hasPermission) {
    await interaction.reply({
      content: "❌ You don't have permission to create events. Required role: SCUM Admin or higher.",
      ephemeral: true
    });
    return true;
  }

  // Show step 1: Event Title
  await interaction.showModal(new ModalBuilder()
    .setCustomId("event_step1_title")
    .setTitle("Create Event - Step 1")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("event_title")
          .setLabel("Event Title (e.g., Clan Raid)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    )
  );

  pendingEvents[interaction.user.id] = { step: 1 };
  return true;
}

// Handle modal submissions for event creation steps
async function handleEventModal(interaction, supabase) {
  const userId = interaction.user.id;
  const pending = pendingEvents[userId];

  if (!pending) return false;

  // STEP 1: Title
  if (interaction.customId === "event_step1_title") {
    pending.title = interaction.fields.getTextInputValue("event_title");
    pending.step = 2;

    await interaction.showModal(new ModalBuilder()
      .setCustomId("event_step2_location")
      .setTitle("Create Event - Step 2")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("event_location")
            .setLabel("Event Location (e.g., Grid D5, Military Base)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      )
    );
    return true;
  }

  // STEP 2: Location
  if (interaction.customId === "event_step2_location") {
    pending.location = interaction.fields.getTextInputValue("event_location");
    pending.step = 3;

    await interaction.showModal(new ModalBuilder()
      .setCustomId("event_step3_description")
      .setTitle("Create Event - Step 3")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("event_description")
            .setLabel("Event Description (max 1024 chars)")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
        )
      )
    );
    return true;
  }

  // STEP 3: Description
  if (interaction.customId === "event_step3_description") {
    pending.description = interaction.fields.getTextInputValue("event_description") || "No description provided";
    pending.step = 4;

    // Show timezone reminder + date/time picker
    const now = new Date();
    const pdtTime = now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" });

    await interaction.reply({
      content: `⏰ **TIME ZONE REMINDER**\nEvents are posted in **PDT (Pacific Daylight Time)**\nPlease enter your event time in PDT\n\nCurrent PDT time: ${pdtTime}`,
      ephemeral: true
    });

    // Since Discord doesn't have native date picker, we'll use a simple format
    await interaction.followUp({
      content: "📅 **Enter event date and time**\nFormat: `MM/DD/YYYY HH:MM AM/PM PDT`\nExample: `05/18/2026 3:00 PM PDT`\n\nJust reply with the date and time:",
      ephemeral: true
    });

    pending.waitingForDateTime = true;
    return true;
  }

  return false;
}

// Handle text input for date/time
async function handleEventDateTimeInput(message, userId, pendingEvents) {
  const pending = pendingEvents[userId];
  
  if (!pending || !pending.waitingForDateTime) return false;

  try {
    // Parse the date/time format: MM/DD/YYYY HH:MM AM/PM PDT
    const dateTimePattern = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s+(AM|PM)/i;
    const match = message.content.match(dateTimePattern);

    if (!match) {
      await message.reply("❌ Invalid format. Please use: `MM/DD/YYYY HH:MM AM/PM PDT`\nExample: `05/18/2026 3:00 PM PDT`");
      return true;
    }

    const [, month, day, year, hour, minute, ampm] = match;
    let hours = parseInt(hour);
    if (ampm.toUpperCase() === "PM" && hours !== 12) hours += 12;
    if (ampm.toUpperCase() === "AM" && hours === 12) hours = 0;

    // Create date in PDT
    const eventDate = new Date(year, month - 1, day, hours, parseInt(minute));
    
    if (eventDate < new Date()) {
      await message.reply("❌ Event date must be in the future!");
      return true;
    }

    pending.event_date = eventDate;
    pending.step = 5;
    pending.waitingForDateTime = false;

    // Step 5: Repeat settings
    const repeatRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("event_repeat_type")
        .setPlaceholder("Select repeat option...")
        .addOptions([
          { label: "Never (one-time event)", value: "never" },
          { label: "Weekly (same day each week)", value: "weekly" },
          { label: "Monthly (same date each month)", value: "monthly" },
          { label: "Custom (every X days)", value: "custom" }
        ])
    );

    await message.reply({
      content: "🔁 **Repeat Settings**\nHow often should this event repeat?",
      components: [repeatRow],
      ephemeral: true
    });

    return true;
  } catch (err) {
    console.error("Date parse error:", err);
    await message.reply("❌ Error parsing date. Please use format: `MM/DD/YYYY HH:MM AM/PM PDT`");
    return true;
  }
}

module.exports = {
  handleEventOption,
  handleEventModal,
  handleEventDateTimeInput,
  pendingEvents
};
