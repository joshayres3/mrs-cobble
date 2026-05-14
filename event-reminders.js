// ============================================================================
// EVENT REMINDER SCHEDULER - Runs every 5 minutes to check for reminders
// ============================================================================

const { getUpcomingEvents, getReminderByType, addReminder, deleteReminderByMessageId } = require("./event-db");
const { buildEventReminderEmbed } = require("./event-calendar");

let reminderIntervalId = null;

function startReminderScheduler(discord, supabase, channelId) {
  // Run every 5 minutes
  reminderIntervalId = setInterval(async () => {
    try {
      const events = await getUpcomingEvents(supabase, 50);
      const now = new Date();

      for (const event of events) {
        const eventDate = new Date(event.event_date);
        const timeDiff = eventDate - now;
        const minutesUntilEvent = timeDiff / (1000 * 60);

        // Check for 1 day before (24 hours)
        if (minutesUntilEvent <= 1440 && minutesUntilEvent > 1435) {
          await sendReminder(discord, supabase, event, "1_day_before", channelId);
        }

        // Check for 1 hour before (60 minutes)
        if (minutesUntilEvent <= 65 && minutesUntilEvent > 60) {
          // Delete old 1-day reminder first
          await deleteOldReminder(discord, supabase, event, "1_day_before");
          await sendReminder(discord, supabase, event, "1_hour_before", channelId);
        }

        // Check for event start
        if (minutesUntilEvent <= 5 && minutesUntilEvent > 0) {
          // Delete old 1-hour reminder first
          await deleteOldReminder(discord, supabase, event, "1_hour_before");
          await sendReminder(discord, supabase, event, "event_start", channelId);
        }
      }
    } catch (error) {
      console.error("Reminder scheduler error:", error);
    }
  }, 5 * 60 * 1000); // 5 minutes

  console.log("✅ Event reminder scheduler started");
}

function stopReminderScheduler() {
  if (reminderIntervalId) {
    clearInterval(reminderIntervalId);
    reminderIntervalId = null;
    console.log("✅ Event reminder scheduler stopped");
  }
}

async function sendReminder(discord, supabase, event, reminderType, channelId) {
  try {
    const channel = discord.channels.cache.get(channelId);
    if (!channel) {
      console.error(`Channel ${channelId} not found`);
      return;
    }

    const embed = buildEventReminderEmbed(event, reminderType);
    
    // Add RSVP button
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
    const button = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`event_rsvp_${event.id}`)
        .setLabel("RSVP")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("✅")
    );

    // Send reminder with @SCUM Buddies mention
    const message = await channel.send({
      content: "@SCUM Buddies 📢",
      embeds: [embed],
      components: [button]
    });

    // Record reminder in database
    await addReminder(supabase, event.id, reminderType, message.id);

    console.log(`✅ Sent ${reminderType} reminder for event: ${event.title}`);
  } catch (error) {
    console.error(`Error sending reminder for event ${event.id}:`, error);
  }
}

async function deleteOldReminder(discord, supabase, event, reminderType) {
  try {
    const reminder = await getReminderByType(supabase, event.id, reminderType);
    
    if (reminder && reminder.reminder_message_id) {
      const channel = discord.channels.cache.get(reminder.channel_id);
      
      // Try to delete the message
      try {
        const message = await channel.messages.fetch(reminder.reminder_message_id);
        await message.delete();
      } catch (e) {
        // Message already deleted or channel not found
      }

      // Delete record from database
      await deleteReminderByMessageId(supabase, reminder.reminder_message_id);
      console.log(`✅ Deleted old ${reminderType} reminder for event: ${event.title}`);
    }
  } catch (error) {
    console.error(`Error deleting old reminder:`, error);
  }
}

module.exports = {
  startReminderScheduler,
  stopReminderScheduler,
  sendReminder,
  deleteOldReminder
};
