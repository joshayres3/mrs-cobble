// ============================================================================
// EVENT CALENDAR - Builds and updates the master calendar embed
// ============================================================================

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { getUpcomingEvents, getUserRSVPs } = require("./event-db");

async function buildCalendarEmbed(supabase, userId = null) {
  const events = await getUpcomingEvents(supabase, 10);
  
  if (events.length === 0) {
    return new EmbedBuilder()
      .setTitle("📅 UPCOMING EVENTS")
      .setDescription("No events scheduled yet.")
      .setColor(0xd4a574)
      .setFooter({ text: "All times shown in PDT (Pacific Daylight Time)" });
  }

  let description = "";
  const userRsvps = userId ? await getUserRSVPs(supabase, userId) : [];

  events.forEach((event, index) => {
    const eventDate = new Date(event.event_date);
    const pdtTime = eventDate.toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });

    const hasRsvped = userRsvps.includes(event.id);
    const rsvpIndicator = hasRsvped ? "✅ " : "";

    description += `${index + 1}. **${event.title}**\n`;
    description += `📍 ${event.location}\n`;
    description += `🕐 ${pdtTime} PDT\n`;
    description += `👥 ${rsvpIndicator}RSVPs: ${event.rsvp_count || 0}\n\n`;
  });

  const embed = new EmbedBuilder()
    .setTitle("📅 UPCOMING EVENTS")
    .setDescription(description)
    .setColor(0xd4a574)
    .setFooter({ text: "All times shown in PDT (Pacific Daylight Time)" });

  return embed;
}

// Build individual event reminder embed
function buildEventReminderEmbed(event, reminderType) {
  const eventDate = new Date(event.event_date);
  const pdtTime = eventDate.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });

  let embed;

  if (reminderType === "1_day_before") {
    // Full details reminder - 1 day before
    embed = new EmbedBuilder()
      .setTitle(`⏰ STARTS IN 1 DAY: ${event.title}`)
      .setDescription(event.location || "No location provided")
      .setColor(0xd4a574);

    if (event.image_url) {
      embed.setImage(event.image_url);
    }

    embed.addFields(
      { name: "📝 Details", value: event.description || "No description provided", inline: false },
      { name: "🕐 Time", value: `${pdtTime} PDT`, inline: false },
      { name: "👥 RSVPs", value: `${event.rsvp_count || 0} players`, inline: false }
    );
  } else if (reminderType === "1_hour_before") {
    // 1 hour before reminder
    embed = new EmbedBuilder()
      .setTitle(`⏰ STARTS IN 1 HOUR: ${event.title}`)
      .setColor(0xffa500);

    if (event.image_url) {
      embed.setImage(event.image_url);
    }

    embed.addFields(
      { name: "🕐 Time", value: `${pdtTime} PDT`, inline: false },
      { name: "👥 RSVPs", value: `${event.rsvp_count || 0} players`, inline: false }
    );
  } else if (reminderType === "event_start") {
    // Event starting now
    embed = new EmbedBuilder()
      .setTitle(`🎮 STARTING NOW: ${event.title}`)
      .setColor(0x4caf50);

    if (event.image_url) {
      embed.setImage(event.image_url);
    }

    embed.addFields(
      { name: "👥 Final RSVPs", value: `${event.rsvp_count || 0} players`, inline: false }
    );
  }

  return embed;
}

// Format time for display
function formatEventTime(eventDate) {
  return new Date(eventDate).toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}

module.exports = {
  buildCalendarEmbed,
  buildEventReminderEmbed,
  formatEventTime
};
