---
name: weekday-morning-brief
description: Weekday 7 AM morning brief: calendar, important unread emails, and what needs attention today.
---

Produce William's morning brief for today and post it here in chat. Keep it concise and scannable.

Steps:
1. Use the Google Calendar connector to list today's events (from now through end of day) on his primary calendar. Note start/end times, titles, locations, and whether any need a response (unaccepted invites).
2. Use the Gmail connector to find important unread emails. Search unread messages in the inbox (e.g. queries like "is:unread in:inbox" and prioritize "is:unread is:important in:inbox"). Focus on messages that look like they need action or a reply — skip newsletters, promotions, and automated notifications.
3. Identify anything that needs attention today: meetings requiring prep, calendar invites awaiting a response, emails asking for a reply or with deadlines/time-sensitive asks.

Output format (use plain, tight sections):
- **📅 Today's calendar** — chronological list of events with times; flag any with a needed response or that lack a location/agenda.
- **📧 Needs a reply / important unread** — each item: sender, one-line subject/summary, and why it matters. Cap at the top ~5-7.
- **⚠️ Needs your attention today** — short bullet list of the concrete to-dos pulled from calendar + email (RSVPs, deadlines, prep).

If a section is empty, say so in one line (e.g. "No events today"). If a connector returns an error or isn't authorized, note it briefly and continue with the rest. Keep the whole brief short enough to read in under a minute.