// Invite links and device names: pure helpers, no network.

/** Unambiguous lowercase letters and digits (no 0/o, 1/l/i). */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function newInviteCode(length = 10, random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  return Array.from(random(length), (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export const isInviteCode = (s: string) => /^[a-z0-9]{8,32}$/.test(s);

/** The public address of the app with `?invite=CODE` (and an optional email to pre-fill sign-in). */
export function inviteLink(appUrl: string, code: string): string {
  const u = new URL(appUrl);
  u.search = '';
  u.hash = '';
  u.searchParams.set('invite', code);
  return u.toString();
}

/** Link that opens the app on another device with the teacher's email already filled in. */
export function signInLink(appUrl: string, email: string): string {
  const u = new URL(appUrl);
  u.search = '';
  u.hash = '';
  u.searchParams.set('signin', email);
  return u.toString();
}

/** Reads `?invite=` / `?signin=` from a URL; returns the cleaned URL to put back in the address bar. */
export function readLaunchParams(href: string): { invite?: string; signin?: string; clean: string | null } {
  const u = new URL(href);
  const invite = u.searchParams.get('invite')?.trim().toLowerCase();
  const signin = u.searchParams.get('signin')?.trim();
  if (!u.searchParams.has('invite') && !u.searchParams.has('signin')) return { clean: null };
  u.searchParams.delete('invite');
  u.searchParams.delete('signin');
  return {
    invite: invite && isInviteCode(invite) ? invite : undefined,
    signin: signin && /^\S+@\S+\.\S+$/.test(signin) ? signin : undefined,
    clean: u.toString()
  };
}

export function inviteEmail(inviterName: string, link: string, apkUrl?: string): { subject: string; body: string } {
  const who = inviterName.trim() || 'A colleague';
  return {
    subject: `${who} invited you to Solaristic Pulse`,
    body: [
      `${who} has invited you to try Solaristic Pulse, a quick daily check-in app for teachers.`,
      '',
      `Open this link on your phone to get started:`,
      link,
      '',
      'To install it:',
      '• Android: open the link in Chrome → menu (⋮) → Install app.',
      '• iPhone / iPad: open the link in Safari → Share → Add to Home Screen.',
      ...(apkUrl ? [`• Or download the Android app directly: ${apkUrl}`] : []),
      '',
      'Then sign in with your email in Settings → Account & devices to use it on more than one device.'
    ].join('\n')
  };
}

/** A friendly name for this device, e.g. "Android phone (app)" or "Windows PC (Chrome)". */
export function deviceName(ua: string, native: boolean): string {
  const os = /Android/i.test(ua) ? (/Mobile/i.test(ua) ? 'Android phone' : 'Android tablet')
    : /iPhone/i.test(ua) ? 'iPhone'
    : /iPad/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua)) ? 'iPad'
    : /Windows/i.test(ua) ? 'Windows PC'
    : /Macintosh|Mac OS X/i.test(ua) ? 'Mac'
    : /CrOS/i.test(ua) ? 'Chromebook'
    : /Linux/i.test(ua) ? 'Linux PC'
    : 'Device';
  if (native) return `${os} (app)`;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'browser';
  return `${os} (${browser})`;
}
