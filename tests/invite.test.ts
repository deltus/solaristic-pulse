import { describe, expect, it } from 'vitest';
import { deviceName, inviteEmail, inviteLink, isInviteCode, newInviteCode, readLaunchParams, signInLink } from '../src/logic/invite';

const APP = 'https://deltus.github.io/solaristic-pulse/';

describe('invite links', () => {
  it('makes readable codes the database accepts', () => {
    for (let i = 0; i < 50; i++) {
      const c = newInviteCode();
      expect(c).toHaveLength(10);
      expect(isInviteCode(c)).toBe(true);
      expect(c).not.toMatch(/[01ilo]/);
    }
  });

  it('builds invite and sign-in links on the app address', () => {
    expect(inviteLink(APP + '?x=1#/settings', 'abcd2345ef')).toBe(`${APP}?invite=abcd2345ef`);
    expect(signInLink(APP, 'a.b+c@school.edu.au')).toBe(`${APP}?signin=a.b%2Bc%40school.edu.au`);
  });

  it('reads launch parameters and keeps the in-app route', () => {
    const p = readLaunchParams(`${APP}?invite=ABCD2345EF#/today`);
    expect(p.invite).toBe('abcd2345ef');
    expect(p.clean).toBe(`${APP}#/today`);
    const q = readLaunchParams(signInLink(APP, 'a.b+c@school.edu.au'));
    expect(q.signin).toBe('a.b+c@school.edu.au');
    expect(readLaunchParams(`${APP}#/home`).clean).toBeNull();
    expect(readLaunchParams(`${APP}?invite=<script>`).invite).toBeUndefined();
  });

  it('writes an invite email with the link and install steps', () => {
    const m = inviteEmail('Alex Morgan', `${APP}?invite=abcd2345ef`, 'https://example.org/pulse.apk');
    expect(m.subject).toBe('Alex Morgan invited you to Solaristic Radar');
    expect(m.body).toContain(`${APP}?invite=abcd2345ef`);
    expect(m.body).toContain('Add to Home Screen');
    expect(m.body).toContain('https://example.org/pulse.apk');
    expect(inviteEmail(' ', 'x').subject).toBe('A colleague invited you to Solaristic Radar');
  });

  it('names devices', () => {
    expect(deviceName('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36', true)).toBe('Android phone (app)');
    expect(deviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36 Edg/130', false)).toBe('Windows PC (Edge)');
    expect(deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', false)).toBe('iPhone (Safari)');
  });
});
