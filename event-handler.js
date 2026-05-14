// ============================================================================
// EVENT HANDLER - Main entry point for event creation/management
// ============================================================================

const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { createEvent, getUpcomingEvents, deleteEvent } = require("./event-db");
const { buildCalendarEmbed } = require("./event-calendar");

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
    await finalizeEvent(interaction, pending, supabase, interaction.client);
  }

  return true;
}

// Handle custom repeat days input
async function handleEventRepeatDaysInput(message, userId, pendingEvents, supabase, client) {
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
    await finalizeEvent(message, pending, supabase, client);
    return true;
  } catch (err) {
    console.error("Repeat days parse error:", err);
    await message.reply("❌ Error parsing repeat days.");
    return true;
  }
}

// Handle delete event button
async function handleDeleteEventButton(interaction, supabase) {
  if (!interaction.customId.startsWith("event_delete_")) return false;

  // Check if user is admin (Sr. Admin or Owner)
  const hasPermission = interaction.member.roles.cache.some(role => 
    ["Sr. Admin", "Owner"].includes(role.name)
  );

  if (!hasPermission) {
    await interaction.reply({
      content: "❌ Only admins can delete events.",
      ephemeral: true
    });
    return true;
  }

  const eventId = interaction.customId.replace("event_delete_", "");

  try {
    await deleteEvent(supabase, eventId);
    
    // Delete the calendar message
    try {
      await interaction.message.delete();
    } catch (err) {
      console.error("Failed to delete message:", err);
    }

    await interaction.reply({
      content: "✅ Event deleted.",
      ephemeral: true
    });

    return true;
  } catch (err) {
    console.error("Delete event error:", err);
    await interaction.reply({
      content: `❌ Error deleting event: ${err.message}`,
      ephemeral: true
    });
    return true;
  }
}

// Finalize and create event
async function finalizeEvent(interaction, pending, supabase, client) {
  try {
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

    // Post calendar with RSVP and DELETE buttons to events channel
    const EVENT_CHANNEL_ID = "1504618527242326170";
    try {
      const eventChannel = await client.channels.fetch(EVENT_CHANNEL_ID);
      if (eventChannel) {
        const calendarEmbed = await buildCalendarEmbed(supabase);
        
        // Create button row with RSVP and DELETE buttons
        const buttonRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`event_rsvp_${event[0].id}`)
            .setLabel(`RSVP (0)`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji("✅"),
          new ButtonBuilder()
            .setCustomId(`event_delete_${event[0].id}`)
            .setLabel("Delete Event")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("🗑️")
        );
        
        const message = await eventChannel.send({ 
          embeds: [calendarEmbed],
          components: [buttonRow]
        });
        
        // Store message ID in database for later updates
        await supabase
          .from("events")
          .update({ calendar_message_id: message.id })
          .eq("id", event[0].id);
      }
    } catch (err) {
      console.error("Failed to post calendar:", err);
    }

    const confirmMsg = `✅ **Event Created: ${pending.title}**\n📍 Location: ${pending.location}\n⏰ Date: ${pending.event_date.toLocaleString("en-US")} PST`;

    const isMessage = interaction.isCommand?.() === false && !interaction.isModalSubmit?.();
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
    
    const isMessage = interaction.isCommand?.() === false && !interaction.isModalSubmit?.();
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

    // Parse flexible date/time format: MM/DD/YYYY HH:MM AM/PM
    // Accepts: 7:30 PM, 07:30 PM, 7:30p, 7:30PM, 730PM, 730pm, etc.
    const dateTimePattern = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):?(\d{2})?\s*(am|pm|a|p)?/i;
    const match = dateTimeStr.match(dateTimePattern);

    if (!match) {
      await interaction.reply({
        content: "❌ Invalid date/time format.\nExamples: `05/14/2026 7:30 PM` or `05/14/2026 730pm`",
        ephemeral: true
      });
      return true;
    }

    const [, month, day, year, hour, minute, ampm] = match;
    let hours = parseInt(hour);
    let mins = minute ? parseInt(minute) : 0;
    
    // Parse AM/PM if provided
    if (ampm) {
      const ispm = ampm.toLowerCase().startsWith('p');
      if (ispm && hours !== 12) hours += 12;
      if (!ispm && hours === 12) hours = 0;
    }

    // Create date using local timezone
    const eventDate = new Date(year, month - 1, day, hours, mins);
    
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
      content: `✅ Event details saved!\n📅 **${title}** at **${location}**\n⏰ **${eventDate.toLocaleString("en-US")} PST**\n\n🔁 **How often should this event repeat?**`,
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
  handleDeleteEventButton,
  pendingEvents
};
