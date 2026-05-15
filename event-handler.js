// ============================================================================
// EVENT HANDLER - Main entry point for event creation/management
// ============================================================================

const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { createEvent, getUpcomingEvents, deleteEvent } = require("./event-db");

const pendingEvents = {};

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

    console.log("Event created:", event);

    // Post calendar with RSVP and DELETE buttons to events channel
    const EVENT_CHANNEL_ID = "1504618527242326170";
    console.log("Attempting to post calendar to channel:", EVENT_CHANNEL_ID);
    try {
      const eventChannel = await client.channels.fetch(EVENT_CHANNEL_ID);
      console.log("Channel fetched:", eventChannel?.name || "unknown");
      if (eventChannel) {
        console.log("Building event embed...");
        
        const eventDate = new Date(event.event_date);
        const timeStr = eventDate.toLocaleString("en-US", { 
          month: "short", 
          day: "numeric", 
          hour: "numeric", 
          minute: "2-digit", 
          hour12: true 
        });
        
        const eventEmbed = new EmbedBuilder()
          .setTitle(`📅 ${event.title}`)
          .setDescription(event.description || "No description provided")
          .addFields(
            { name: "📍 Location", value: event.location, inline: false },
            { name: "🕐 Time", value: `${timeStr} PST`, inline: false },
            { name: "👥 RSVPs", value: `${event.rsvp_count || 0} players`, inline: false }
          )
          .setColor(0xd4a574)
          .setFooter({ text: "Times shown in PST" });
        
        console.log("Sending event message...");
        
        // Create button row with RSVP and DELETE buttons for this specific event
        const buttonRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`event_rsvp_${event.id}`)
            .setLabel(`RSVP (${event.rsvp_count || 0})`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji("✅"),
          new ButtonBuilder()
            .setCustomId(`event_delete_${event.id}`)
            .setLabel("Delete Event")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("🗑️")
        );
        
        const message = await eventChannel.send({ 
          content: "<@&1186345001219788840> New event posted!",
          embeds: [eventEmbed],
          components: [buttonRow]
        });
        console.log("Event posted successfully, message ID:", message.id);
        
        // Store message ID in database for later updates
        await supabase
          .from("events")
          .update({ calendar_message_id: message.id })
          .eq("id", event.id);
      } else {
        console.error("Channel not found!");
      }
    } catch (err) {
      console.error("Failed to post calendar:", err);
    }

    const confirmMsg = `✅ **Event Created: ${pending.title}**\n📍 Location: ${pending.location}\n⏰ Date: ${pending.event_date.toLocaleString("en-US")} PST\n🔁 Repeats: ${pending.repeat_type}`;

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
async function handleEventModal(interaction, supabase, client) {
  const userId = interaction.user.id;
  const pending = pendingEvents[userId];

  if (!pending || interaction.customId !== "event_create_all") return false;

  try {
    const title = interaction.fields.getTextInputValue("event_title");
    const location = interaction.fields.getTextInputValue("event_location");
    const description = interaction.fields.getTextInputValue("event_description") || "No description provided";
    const dateTimeStr = interaction.fields.getTextInputValue("event_datetime");
    const repeatStr = interaction.fields.getTextInputValue("event_repeat");

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

    // Parse repeat option
    const repeatInput = repeatStr.toLowerCase().trim();
    let repeatType = "never";
    let repeatEvery = null;

    if (repeatInput === "weekly") {
      repeatType = "weekly";
    } else if (repeatInput === "monthly") {
      repeatType = "monthly";
    } else if (repeatInput.startsWith("custom")) {
      const parts = repeatInput.split(" ");
      if (parts.length >= 2) {
        const days = parseInt(parts[1]);
        if (!isNaN(days) && days >= 1) {
          repeatType = "custom";
          repeatEvery = days;
        }
      }
    }

    // Update pending with all info
    pending.title = title;
    pending.location = location;
    pending.description = description;
    pending.event_date = eventDate;
    pending.repeat_type = repeatType;
    pending.repeat_every = repeatEvery;

    // Create the event immediately
    await finalizeEvent(interaction, pending, supabase, client);

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
  handleDeleteEventButton,
  pendingEvents
};
