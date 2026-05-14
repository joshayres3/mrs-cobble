// ============================================================================
// EVENT DATABASE - All Supabase queries for events
// ============================================================================

async function createEvent(supabase, eventData) {
  const { data, error } = await supabase
    .from("events")
    .insert([{
      title: eventData.title,
      description: eventData.description,
      location: eventData.location,
      image_url: eventData.image_url || null,
      event_date: eventData.event_date,
      repeat_type: eventData.repeat_type || "never",
      repeat_every: eventData.repeat_every || null,
      created_by: eventData.created_by,
      status: "active",
      rsvp_count: 0
    }])
    .select();

  if (error) {
    console.error("Error creating event:", error);
    throw error;
  }

  return data[0];
}

async function getUpcomingEvents(supabase, limit = 10) {
  const now = new Date();
  
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("status", "active")
    .gte("event_date", now.toISOString())
    .order("event_date", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("Error fetching upcoming events:", error);
    return [];
  }

  return data;
}

async function getEventById(supabase, eventId) {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .single();

  if (error) {
    console.error("Error fetching event:", error);
    return null;
  }

  return data;
}

async function updateEvent(supabase, eventId, updates) {
  const { data, error } = await supabase
    .from("events")
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq("id", eventId)
    .select();

  if (error) {
    console.error("Error updating event:", error);
    throw error;
  }

  return data[0];
}

async function deleteEvent(supabase, eventId) {
  const { error } = await supabase
    .from("events")
    .delete()
    .eq("id", eventId);

  if (error) {
    console.error("Error deleting event:", error);
    throw error;
  }

  return true;
}

async function pauseEvent(supabase, eventId) {
  return updateEvent(supabase, eventId, { status: "paused" });
}

async function resumeEvent(supabase, eventId) {
  return updateEvent(supabase, eventId, { status: "active" });
}

// RSVP Functions
async function addRSVP(supabase, eventId, discordId) {
  const { data, error } = await supabase
    .from("event_rsvps")
    .insert([{
      event_id: eventId,
      discord_id: discordId
    }])
    .select();

  if (error && error.code !== "23505") { // 23505 = unique constraint violation (already RSVP'd)
    console.error("Error adding RSVP:", error);
    throw error;
  }

  // Update RSVP count
  const { count, error: countError } = await supabase
    .from("event_rsvps")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId);

  if (!countError) {
    await updateEvent(supabase, eventId, { rsvp_count: count });
  }

  return { data, alreadyRsvped: !!error };
}

async function removeRSVP(supabase, eventId, discordId) {
  const { error } = await supabase
    .from("event_rsvps")
    .delete()
    .eq("event_id", eventId)
    .eq("discord_id", discordId);

  if (error) {
    console.error("Error removing RSVP:", error);
    throw error;
  }

  // Update RSVP count
  const { count, error: countError } = await supabase
    .from("event_rsvps")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId);

  if (!countError) {
    await updateEvent(supabase, eventId, { rsvp_count: count });
  }

  return true;
}

async function getRSVPCount(supabase, eventId) {
  const { count, error } = await supabase
    .from("event_rsvps")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId);

  if (error) return 0;
  return count;
}

async function getUserRSVPs(supabase, discordId) {
  const { data, error } = await supabase
    .from("event_rsvps")
    .select("event_id")
    .eq("discord_id", discordId);

  if (error) return [];
  return data.map(r => r.event_id);
}

// Reminder Functions
async function addReminder(supabase, eventId, reminderType, messageId) {
  const { data, error } = await supabase
    .from("event_reminders")
    .insert([{
      event_id: eventId,
      reminder_type: reminderType,
      reminder_message_id: messageId
    }])
    .select();

  if (error) {
    console.error("Error adding reminder:", error);
    throw error;
  }

  return data[0];
}

async function getReminderByType(supabase, eventId, reminderType) {
  const { data, error } = await supabase
    .from("event_reminders")
    .select("*")
    .eq("event_id", eventId)
    .eq("reminder_type", reminderType)
    .single();

  if (error && error.code !== "PGRST116") { // PGRST116 = no rows found
    console.error("Error fetching reminder:", error);
    return null;
  }

  return data || null;
}

async function deleteReminder(supabase, reminderId) {
  const { error } = await supabase
    .from("event_reminders")
    .delete()
    .eq("id", reminderId);

  if (error) {
    console.error("Error deleting reminder:", error);
    throw error;
  }

  return true;
}

async function deleteReminderByMessageId(supabase, messageId) {
  const { error } = await supabase
    .from("event_reminders")
    .delete()
    .eq("reminder_message_id", messageId);

  if (error) {
    console.error("Error deleting reminder by message ID:", error);
  }

  return true;
}

module.exports = {
  // Event CRUD
  createEvent,
  getUpcomingEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  pauseEvent,
  resumeEvent,
  // RSVP
  addRSVP,
  removeRSVP,
  getRSVPCount,
  getUserRSVPs,
  // Reminders
  addReminder,
  getReminderByType,
  deleteReminder,
  deleteReminderByMessageId
};
