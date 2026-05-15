const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");

const pendingEvents = {};

async function handleEventModal(interaction, eventDb) {
  try {
    if (interaction.customId !== "event_create_all") return;

    const title = interaction.fields.getTextInputValue("event_title");
    const locationDescription = interaction.fields.getTextInputValue("event_location_desc");
    const dateTime = interaction.fields.getTextInputValue("event_datetime");
    const repeat = interaction.fields.getTextInputValue("event_repeat");
    const imageUrl = interaction.fields.getTextInputValue("event_image") || null;

    // Parse datetime (format: MM/DD/YYYY HH:MM AM/PM)
    const dateParts = dateTime.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s+(AM|PM)/i);
    if (!dateParts) {
      return await interaction.reply({
        content: "❌ Invalid date format. Use MM/DD/YYYY HH:MM AM/PM (e.g., 05/14/2026 7:30 PM)",
        ephemeral: true
      });
    }

    const [, month, day, year, hour, min, ampm] = dateParts;
    let hour24 = parseInt(hour);
    if (ampm.toUpperCase() === "PM" && hour24 !== 12) hour24 += 12;
    if (ampm.toUpperCase() === "AM" && hour24 === 12) hour24 = 0;

    const eventDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour24.toString().padStart(2, '0')}:${min}:00Z`);
    if (isNaN(eventDate.getTime())) {
      return await interaction.reply({
        content: "❌ Invalid date. Please enter a valid date and time.",
        ephemeral: true
      });
    }

    // Validate repeat value
    const repeatMatch = repeat.toLowerCase().match(/^(never|weekly|monthly|custom\s+(\d+))$/);
    if (!repeatMatch) {
      return await interaction.reply({
        content: "❌ Invalid repeat value. Use: never, weekly, monthly, or custom X (e.g., custom 3)",
        ephemeral: true
      });
    }

    const repeatType = repeatMatch[1].toLowerCase();
    const repeatEvery = repeatMatch[2] ? parseInt(repeatMatch[2]) : null;

    // Create event in database
    const event = await eventDb.createEvent({
      title,
      location: locationDescription, // This now contains both location AND description
      description: null, // No separate description field
      image_url: imageUrl,
      event_date: eventDate,
      repeat_type: repeatType,
      repeat_every: repeatEvery,
      created_by: interaction.user.id
    });

    await interaction.reply({
      content: `✅ Event "${title}" created! Posting to #Cobble-Events now...`,
      ephemeral: true
    });

    // Delete pending event data if exists
    delete pendingEvents[interaction.user.id];

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

async function showCreateEventModal(interaction) {
  try {
    const modal = new ModalBuilder()
      .setCustomId("event_create_all")
      .setTitle("Create Event")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("event_title")
            .setLabel("Event Title")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("e.g., Weekly Raid Night")
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("event_location_desc")
            .setLabel("Location & Details")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("e.g., Grid D5, bring guns and meds, meet at base entrance")
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("event_datetime")
            .setLabel("Date & Time")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("MM/DD/YYYY HH:MM AM/PM (e.g., 05/14/2026 7:30 PM)")
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("event_repeat")
            .setLabel("Repeat")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("never, weekly, monthly, or custom 3")
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("event_image")
            .setLabel("Image URL (optional)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("https://example.com/image.jpg")
            .setRequired(false)
        )
      );

    await interaction.showModal(modal);
  } catch (err) {
    console.error("Error showing modal:", err);
    await interaction.reply({
      content: "❌ Error showing event form. Try again.",
      ephemeral: true
    });
  }
}

module.exports = {
  handleEventModal,
  showCreateEventModal,
  pendingEvents
};
