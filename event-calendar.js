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
    // Full details reminder
    embed = new EmbedBuilder()
      .setTitle(`📢 ${event.title}`)
      .setDescription(event.description || "No description provided")
      .setColor(0xd4a574);

    if (event.image_url) {
      embed.setImage(event.image_url);
    }

    embed.addFields(
      { name: "📍 Location", value: event.location, inline: false },
      { name: "🕐 Time", value: `${pdtTime} PDT`, inline: false },
      { name: "👥 RSVPs", value: `${event.rsvp_count || 0} players`, inline: false }
    );
  } else if (reminderType === "1_hour_before") {
    // Minimal reminder - just name and image
    embed = new EmbedBuilder()
      .setTitle(`📢 ${event.title}`)
      .setColor(0xd4a574);

    if (event.image_url) {
      embed.setImage(event.image_url);
    }

    embed.addFields(
      { name: "👥 RSVPs", value: `${event.rsvp_count || 0} players`, inline: false }
    );
  } else if (reminderType === "event_start") {
    // Event starting now - name and image only
    embed = new EmbedBuilder()
      .setTitle(`🎮 EVENT STARTING NOW: ${event.title}`)
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
