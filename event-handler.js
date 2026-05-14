// ============================================================================
// EVENT HANDLER - Main entry point for event creation/management
// ============================================================================

const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { createEvent, getUpcomingEvents, updateEvent, deleteEvent, pauseEvent } = require("./event-db");

const pendingEvents = {};

// Handle repeat type selection
async function handleEventRepeatSelect(interaction, supabase) {
  if (interaction.customId !== "event_repeat_type") return false;

  const userId = interaction.user.id;
  const pending = pendingEvents[userId];

  if (!pending) {
    await interaction.reply({
      content: "❌ Session expired. Start over with `!post` → Create Event",
      ephemeral: true
    });
    return true;
  }

  const repeatType = interaction.values[0];
  pending.repeat_type = repeatType;

  if (repeatType === "custom") {
    pending.waitingForRepeatDays = true;
    await interaction.reply({
      content: `🔁 **Custom Repeat**\nReply with the number of days between repeats (e.g., \`3\` for every 3 days):`,
      ephemeral: true
    });
  } else {
    // For never, weekly, monthly - create the event immediately
    await finalizeEvent(interaction, pending, supabase);
  }

  return true;
}

// Handle custom repeat days input
async function handleEventRepeatDaysInput(message, userId, pendingEvents, supabase) {
  const pending = pendingEvents[userId];
  
  if (!pending || !pending.waitingForRepeatDays) return false;

  try {
    const days = parseInt(message.content);
    if (isNaN(days) || days < 1) {
      await message.reply("❌ Please enter a valid number of days (e.g., `3`)");
      return true;
    }

    pending.repeat_every = days;
    pending.waitingForRepeatDays = false;

    await message.reply("✅ Event settings finalized. Creating event...");
    
    // Create the event
    await finalizeEvent(message, pending, supabase, true);
    return true;
  } catch (err) {
    console.error("Repeat days parse error:", err);
    await message.reply("❌ Error parsing repeat days.");
    return true;
  }
}

// Finalize and create event
async function finalizeEvent(interaction, pending, supabase, isMessage = false) {
  try {
    const { createEvent } = require("./event-db");

    // Create event in database
    const event = await createEvent(supabase, {
      title: pending.title,
      description: pending.description,
      location: pending.location,
      event_date: pending.event_date,
      repeat_type: pending.repeat_type,
      repeat_every: pending.repeat_every,
      created_by: interaction.user.id
    });

    const confirmMsg = `✅ **Event Created: ${pending.title}**\n📍 Location: ${pending.location}\n⏰ Date: ${pending.event_date.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} PDT`;

    if (isMessage) {
      await interaction.channel.send(confirmMsg);
    } else {
      await interaction.reply({
        content: confirmMsg,
        ephemeral: true
      });
    }

    // Clean up pending event
    delete pendingEvents[interaction.user.id];

    return true;
  } catch (err) {
    console.error("Event creation error:", err);
    const errorMsg = `❌ Error creating event: ${err.message}`;
    if (isMessage) {
      await interaction.channel.send(errorMsg);
    } else {
      await interaction.reply({
        content: errorMsg,
        ephemeral: true
      });
    }
    return true;
  }
}

// Handle modal submissions for event creation
async function handleEventModal(interaction, supabase) {
  const userId = interaction.user.id;
  const pending = pendingEvents[userId];

  if (!pending || interaction.customId !== "event_create_all") return false;

  try {
    const title = interaction.fields.getTextInputValue("event_title");
    const location = interaction.fields.getTextInputValue("event_location");
    const description = interaction.fields.getTextInputValue("event_description") || "No description provided";
    const dateTimeStr = interaction.fields.getTextInputValue("event_datetime");

    // Parse the date/time format: MM/DD/YYYY HH:MM AM/PM PDT
    const dateTimePattern = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s+(AM|PM)/i;
    const match = dateTimeStr.match(dateTimePattern);

    if (!match) {
      await interaction.reply({
        content: "❌ Invalid date/time format. Please use: `MM/DD/YYYY HH:MM AM/PM PDT`\nExample: `05/18/2026 3:00 PM PDT`",
        ephemeral: true
      });
      return true;
    }

    const [, month, day, year, hour, minute, ampm] = match;
    let hours = parseInt(hour);
    if (ampm.toUpperCase() === "PM" && hours !== 12) hours += 12;
    if (ampm.toUpperCase() === "AM" && hours === 12) hours = 0;

    // Create date in PDT
    const eventDate = new Date(year, month - 1, day, hours, parseInt(minute));
    
    if (eventDate < new Date()) {
      await interaction.reply({
        content: "❌ Event date must be in the future!",
        ephemeral: true
      });
      return true;
    }

    // Update pending with all info
    pending.title = title;
    pending.location = location;
    pending.description = description;
    pending.event_date = eventDate;

    // Ask for repeat settings
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

    await interaction.reply({
      content: `✅ Event details saved!\n📅 **${title}** at **${location}**\n⏰ **${eventDate.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} PDT**\n\n🔁 **How often should this event repeat?**`,
      components: [repeatRow],
      ephemeral: true
    });

    return true;
  } catch (err) {
    console.error("Modal handling error:", err);
    await interaction.reply({
      content: `❌ Error processing event: ${err.message}`,
      ephemeral: true
    });
    return true;
  }
}

// Handle text input for date/time (legacy - not used in new flow)
async function handleEventDateTimeInput(message, userId, pendingEvents) {
  return false; // Not used
}

module.exports = {
  handleEventModal,
  handleEventDateTimeInput,
  handleEventRepeatSelect,
  handleEventRepeatDaysInput,
  pendingEvents
};
