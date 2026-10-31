// Email drafts the teacher sends from their own email (Radar never sends anything itself).
// Placeholders in {curly brackets} are filled in by the app; anything left in [square brackets]
// is for the teacher to fill in before sending. Keep the wording calm, factual and short.
//
//   {student}  the student's first (or preferred) name
//   {class}    the class name
//   {date}     e.g. Saturday 31 October 2026
//   {time}     e.g. 10:42
//   {what}     what happened, as the teacher wrote it (other students' names removed in the home email)
//   {action}   what the school did
//   {role}     who the staff email is for (e.g. Year level coordinator)
//   {facts}    the full report (staff email only)
//   {teacher}  the teacher's name
//   {school}   the school's name

export const HOME_EMAIL = {
  subject: '{student}: {class} today',
  body: `Dear [parent or carer's name],

I'm writing to let you know about something that happened in {class} on {date}, at about {time}.

{what}

{action}

I'd be happy to talk about this if that would help. Please reply to this email or call the school to arrange a time.

Kind regards,
{teacher}
{school}`
};

/** Contact home without an incident (e.g. from Brain dump). */
export const HOME_EMAIL_GENERAL = {
  subject: '{student}: {class}',
  body: `Dear [parent or carer's name],

I wanted to get in touch about {student}.

{what}

I'd be happy to talk about this if that would help. Please reply to this email or call the school to arrange a time.

Kind regards,
{teacher}
{school}`
};

export const STAFF_EMAIL = {
  subject: 'Incident: {student}, {class}, {date}',
  body: `Hi [name],

For your information ({role}): there was an incident involving {student} in {class} on {date} at {time}.

{facts}

Happy to discuss.

{teacher}`
};

/** The line used for {action} when no action was recorded. */
export const NO_ACTION_LINE = 'The matter was dealt with in class.';
/** {action} lead-in in the home email. */
export const ACTION_LEAD = 'At school, we';
