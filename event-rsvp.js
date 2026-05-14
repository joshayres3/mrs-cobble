// ============================================================================
// EVENT RSVP HANDLER - Handles RSVP button clicks
// ============================================================================

const { addRSVP, removeRSVP, getUserRSVPs, getEventById } = require("./event-db");
const { buildCalendarEmbed } = require("./event-calendar");

async function handleEventRSVPButton(interaction, supabase) {
  if (!interaction.customId.startsWith("event_rsvp_")) {
    return false;
  }

  const eventId = interaction.customId.replace("event_rsvp_", "");
  const discordId = interaction.user.id;

  try {
    // Check if user already RSVP'd
    const userRsvps = await getUserRSVPs(supabase, discordId);
    const alreadyRsvped = userRsvps.includes(eventId);

    if (alreadyRsvped) {
      // Remove RSVP (toggle off)
      await removeRSVP(supabase, eventId, discordId);
      await interaction.reply({
        content: "❌ You've been removed from the RSVP list.",
        ephemeral: true
      });
    } else {
      // Add RSVP (toggle on)
      const event = await getEventById(supabase, eventId);
      if (!event) {
        await interaction.reply({
          content: "❌ Event not found.",
          ephemeral: true
        });
        return true;
      }

      await addRSVP(supabase, eventId, discordId);
      await interaction.reply({
        content: `✅ You're in! See you at **${event.title}**!`,
        ephemeral: true
      });
    }

    return true;
  } catch (error) {
    console.error("RSVP button error:", error);
    await interaction.reply({
      content: "❌ Error processing RSVP. Please try again.",
      ephemeral: true
    });
    return true;
  }
}

module.exports = {
  handleEventRSVPButton
};
