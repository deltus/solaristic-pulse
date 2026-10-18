// End-to-end encryption for synced records: one AES-GCM key per teacher, created on their first device.
// It moves between devices only inside the "Add a device" QR code or as the recovery key they write down.

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const toB64Url = (bytes: Uint8Array) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromB64Url = (s: string) => unb64(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));

export function newKeyBytes(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

export function importKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(value)));
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv);
  out.set(new Uint8Array(ct), 12);
  return b64(out);
}

export async function decryptJson<T = unknown>(key: CryptoKey, text: string): Promise<T> {
  const bytes = unb64(text);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12));
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}

/* ---------- Recovery key: 52 characters in groups of four, easy to read aloud and type ---------- */

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford: no I, L, O, U

export function toRecoveryKey(raw: Uint8Array): string {
  let bits = 0, value = 0, out = '';
  for (const byte of raw) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out.match(/.{1,4}/g)!.join('-');
}

/** Accepts any spacing, dashes and case; tolerates O/I/L typed for 0/1/1. Returns null if it isn't a valid key. */
export function fromRecoveryKey(text: string): Uint8Array | null {
  const clean = text.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (clean.length !== 52 || /[^0-9A-Z]/.test(clean) || /U/.test(clean)) return null;
  const out: number[] = [];
  let bits = 0, value = 0;
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return out.length >= 32 ? new Uint8Array(out.slice(0, 32)) : null;
}

/** Stored in the cloud so a device can tell whether a typed or scanned key is the right one. */
const CHECK = 'solaristic-pulse-key-check';
export const makeKeyCheck = (key: CryptoKey) => encryptJson(key, CHECK);
export async function keyMatches(key: CryptoKey, check: string): Promise<boolean> {
  try {
    return (await decryptJson(key, check)) === CHECK;
  } catch {
    return false;
  }
}
