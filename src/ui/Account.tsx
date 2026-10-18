// Settings → Account & devices, Settings → Invite a colleague, and the welcome card for invite links.

import { useEffect, useState } from 'preact/hooks';
import type { Settings } from '../types';
import * as cloud from '../cloud';
import { inviteEmail, inviteLink, newInviteCode, signInLink } from '../logic/invite';
import { canInstall, isInstalled, isNative, mailtoLink, promptInstall, shareText } from '../platform';
import { saveFile } from '../files';
import { Field, Icon, toast } from './components';
import { SyncCard } from './Sync';
import { keyFragment, syncWanted } from '../sync/cloudSync';

/* ---------- QR code ---------- */

export function QrCode({ text, size = 220, filename }: { text: string; size?: number; filename?: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let live = true;
    import('qrcode').then((Q) => Q.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0E1A3A', light: '#FFFFFF' } }))
      .then((s) => live && setSvg(s));
    return () => { live = false; };
  }, [text]);
  async function saveImage() {
    const Q = await import('qrcode');
    const blob = await (await fetch(await Q.toDataURL(text, { width: 1024, margin: 2, color: { dark: '#0E1A3A', light: '#FFFFFF' } }))).blob();
    await saveFile(blob, filename ?? 'solaristic-pulse-qr.png', 'sample');
  }
  return (
    <div class="qr-wrap">
      <div class="qr" style={`width:${size}px;height:${size}px`} role="img" aria-label="QR code" dangerouslySetInnerHTML={{ __html: svg }} />
      {filename && <button class="btn small ghost" onClick={saveImage}><Icon name="download" /> Save QR image</button>}
    </div>
  );
}

function CopyLink({ link }: { link: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast('Link copied');
    } catch {
      toast('Copy failed: select the link and copy it');
    }
  }
  return (
    <div class="copy-link">
      <input class="input mono" readOnly value={link} onFocus={(e) => (e.target as HTMLInputElement).select()} aria-label="Link" />
      <button class="btn small" onClick={copy}>Copy</button>
    </div>
  );
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 2) return 'active now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} day${d === 1 ? '' : 's'} ago` : new Date(iso).toLocaleDateString('en-AU');
};

function NotSetUp() {
  return (
    <div class="notice info">
      <b>Accounts are not switched on in this version.</b> Pulse works fully on this device without one. Once the Solaristic cloud is connected, you'll be able to sign in here and use Pulse on your phone and PC.
    </div>
  );
}

/* ---------- Account & devices ---------- */

/** Set by "Sign in to another account" so the sign-in form starts empty. */
let switchingAccount = false;

export function AccountSection({ s }: { s: Settings }) {
  const acc = cloud.useAccount();
  if (acc.status === 'off') return <NotSetUp />;
  if (acc.status === 'loading') return <p class="small muted">Checking your account…</p>;
  if (acc.status === 'signedOut') return <SignIn defaultEmail={switchingAccount ? '' : cloud.suggestedEmail() ?? s.profile.email} another={switchingAccount} />;
  switchingAccount = false;
  return <SignedIn email={acc.user.email ?? ''} />;
}

export function SignIn({ defaultEmail, another }: { defaultEmail: string; another?: boolean }) {
  const [email, setEmail] = useState(defaultEmail);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function send() {
    const e = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(e)) return setErr('Check the email address.');
    setErr(''); setBusy(true);
    try {
      await cloud.sendSignInCode(e);
      setSent(true);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    if (!/^\d{6,10}$/.test(code)) return setErr('Enter the code from the email.');
    setErr(''); setBusy(true);
    try {
      await cloud.verifySignInCode(email.trim(), code);
      toast('Signed in');
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="card">
      <span class="eyebrow">{another ? 'Sign in to another account' : 'Sign in to your account'}</span>
      <p class="small">Sign in with your email to use Pulse on more than one device, such as your phone in class and your PC for reports. No password: we email you a code.</p>
      {!sent ? (
        <>
          <Field label="Email address"><input class="input" type="email" autoComplete="email" value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && send()} /></Field>
          {err && <p class="error small">{err}</p>}
          <button class="btn primary" disabled={busy} onClick={send}><Icon name="mail" /> {busy ? 'Sending…' : 'Email me a code'}</button>
        </>
      ) : (
        <>
          <p class="small">We sent a code to <b>{email.trim()}</b>. Enter it below, or tap the link in the email on this device.</p>
          <Field label="Code">
            <input class="input mono code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && verify()} />
          </Field>
          {err && <p class="error small">{err}</p>}
          <div class="row wrap">
            <button class="btn primary" disabled={busy} onClick={verify}>{busy ? 'Checking…' : 'Sign in'}</button>
            <button class="btn ghost small" disabled={busy} onClick={() => { setSent(false); setCode(''); setErr(''); }}>Use a different email</button>
            <button class="btn ghost small" disabled={busy} onClick={send}>Send again</button>
          </div>
        </>
      )}
      <p class="tiny muted" style="margin-top:12px">Your account holds your email, name, school and the list of your devices. Student records only leave a device if you turn on Live sync, with names and notes encrypted.</p>
    </div>
  );
}

function SignedIn({ email }: { email: string }) {
  const [devices, setDevices] = useState<cloud.Device[] | null>(null);
  const [err, setErr] = useState('');
  const [showQr, setShowQr] = useState(false);
  const me = cloud.thisDeviceId();
  const load = () => cloud.listDevices().then(setDevices, (e) => setErr((e as Error).message));
  const [fragment, setFragment] = useState('');
  useEffect(() => { void cloud.checkInDevice().finally(load); }, []);
  useEffect(() => { if (showQr) void keyFragment().then(setFragment); }, [showQr]);
  const addLink = signInLink(cloud.appUrl(), email) + fragment;

  async function remove(d: cloud.Device) {
    const self = d.id === me;
    if (!confirm(self ? 'Sign out and remove this device?' : `Remove “${d.name}”? It will be signed out the next time it opens.`)) return;
    try {
      await cloud.removeDevice(d.id);
      if (self) await cloud.signOut();
      else load();
      toast(self ? 'Signed out' : 'Device removed');
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  async function switchAccount() {
    const synced = syncWanted() ? ' Sync stops on this device; your records stay here and in this account.' : ' Your records stay on this device.';
    if (!confirm(`Sign out of ${email} and sign in to another account?${synced}`)) return;
    switchingAccount = true;
    await cloud.signOut();
  }
  async function others() {
    if (!confirm('Sign out every other device now? Use this if a phone is lost or you used a shared computer.')) return;
    try {
      await cloud.signOutOtherDevices();
      toast('Other devices signed out');
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <>
      <div class="card">
        <span class="eyebrow">Signed in</span>
        <div class="row between wrap">
          <b>{email}</b>
          <div class="row wrap">
            <button class="btn small" onClick={switchAccount}>Sign in to another account</button>
            <button class="btn small" onClick={async () => { await cloud.signOut(); toast('Signed out'); }}>Sign out</button>
          </div>
        </div>
      </div>

      <SyncCard />

      <div class="section"><h2>Linked devices</h2></div>
      {err && <p class="error small">{err}</p>}
      <div class="list">
        {!devices ? <div class="list-item small muted">Loading…</div> : devices.map((d) => (
          <div key={d.id} class="list-item">
            <Icon name="devices" />
            <span class="grow">
              <span class="title">{d.name || 'Device'}</span>
              {d.id === me && <span class="badge blue" style="margin-left:6px">This device</span>}
              <div class="sub">{d.id === me ? 'active now' : `Last active ${ago(d.last_seen)}`} · added {new Date(d.created_at).toLocaleDateString('en-AU')}</div>
            </span>
            <button class="btn small ghost danger" onClick={() => remove(d)}>Remove</button>
          </div>
        ))}
      </div>

      <div class="card">
        <span class="eyebrow">Add a device</span>
        <p class="small">On your other phone or PC, scan this code with the camera (or open the link), then sign in with the code we email you.</p>
        {showQr ? (
          <>
            <QrCode text={addLink} />
            {fragment ? <p class="tiny muted">This code includes your sync key, so only show it to your own devices.</p> : <CopyLink link={addLink} />}
          </>
        ) : <button class="btn" onClick={() => setShowQr(true)}><Icon name="qr" /> Show QR code</button>}
        <p class="tiny muted" style="margin-top:10px">Turn on Live sync on both devices to see the same records on each.</p>
      </div>

      <button class="btn danger small" onClick={others}>Sign out all other devices</button>
    </>
  );
}

/* ---------- Invite a colleague ---------- */

export function InviteSection({ s }: { s: Settings }) {
  const acc = cloud.useAccount();
  const signedIn = acc.status === 'signedIn';
  const [email, setEmail] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [invites, setInvites] = useState<cloud.Invite[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const name = s.profile.name.trim();
  const loadInvites = () => cloud.listInvites().then(setInvites, () => setInvites([]));
  useEffect(() => { if (signedIn) void loadInvites(); }, [signedIn]);

  async function create() {
    const e = email.trim();
    if (e && !/^\S+@\S+\.\S+$/.test(e)) return setErr('Check the email address.');
    setErr('');
    if (!signedIn) return setLink(cloud.appUrl());
    setBusy(true);
    try {
      const code = newInviteCode();
      await cloud.createInvite(code, name, e);
      setLink(inviteLink(cloud.appUrl(), code));
      void loadInvites();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const msg = link ? inviteEmail(name, link, cloud.apkUrl()) : null;
  async function share() {
    if (!msg || !link) return;
    if (!(await shareText(msg.subject, msg.body, link))) toast('Sharing is not available here: copy the link instead');
  }

  return (
    <>
      <div class="card">
        <span class="eyebrow">Invite a colleague</span>
        <p class="small">Create a link and QR code that opens Solaristic Pulse with install steps. Show the QR code on your screen, or send the link by email.</p>
        {!signedIn && cloud.cloudConfigured() && <p class="tiny muted">Sign in (Settings → Account & devices) to see when people you invite join.</p>}
        <Field label="Their email (optional)" hint="Fills in the email for you. Nothing is sent until you press Send in your email app.">
          <input class="input" type="email" placeholder="colleague@school.edu.au" value={email} onInput={(e) => { setEmail((e.target as HTMLInputElement).value); setLink(null); }} />
        </Field>
        {err && <p class="error small">{err}</p>}
        {!link && <button class="btn primary" disabled={busy} onClick={create}><Icon name="qr" /> {busy ? 'Creating…' : 'Create invite'}</button>}
        {link && msg && (
          <div class="invite-out">
            <QrCode text={link} filename="solaristic-pulse-invite.png" />
            <CopyLink link={link} />
            <div class="row wrap" style="margin-top:10px">
              <a class="btn primary" href={mailtoLink(email.trim(), msg.subject, msg.body)}><Icon name="mail" /> Email invite</a>
              <button class="btn" onClick={share}><Icon name="share" /> Share</button>
              <button class="btn ghost small" onClick={() => { setLink(null); setEmail(''); }}>New invite</button>
            </div>
          </div>
        )}
      </div>

      {signedIn && invites && invites.length > 0 && (
        <>
          <div class="section"><h2>Your invites</h2></div>
          <div class="list">
            {invites.map((i) => {
              const expired = !i.accepted_at && new Date(i.expires_at) < new Date();
              return (
                <div key={i.code} class="list-item">
                  <span class="grow">
                    <span class="title">{i.invitee_email || 'Invite link'}</span>
                    <div class="sub">Created {new Date(i.created_at).toLocaleDateString('en-AU')}{i.accepted_at ? ` · joined ${new Date(i.accepted_at).toLocaleDateString('en-AU')}` : ''}</div>
                  </span>
                  <span class={`badge ${i.accepted_at ? 'ok' : expired ? '' : 'blue'}`}>{i.accepted_at ? 'Joined' : expired ? 'Expired' : 'Waiting'}</span>
                  {!i.accepted_at && <button class="icon-btn" aria-label="Delete invite" onClick={async () => { await cloud.deleteInvite(i.code); void loadInvites(); }}><Icon name="trash" /></button>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

/* ---------- Welcome card for people who opened an invite link ---------- */

export function InviteWelcome() {
  const [code, setCode] = useState(cloud.pendingInvite());
  const [from, setFrom] = useState<string | null>(null);
  const [installable, setInstallable] = useState(canInstall());
  useEffect(() => {
    if (code) cloud.inviteDetails(code).then((d) => d && !d.expired && setFrom(d.inviter_name)).catch(() => {});
    const t = setInterval(() => setInstallable(canInstall()), 1000);
    return () => clearInterval(t);
  }, [code]);
  if (!code) return null;
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const apk = cloud.apkUrl();
  return (
    <div class="notice info invite-welcome">
      <div class="row between" style="align-items:flex-start">
        <b>{from ? `${from} invited you to Solaristic Pulse` : 'You were invited to Solaristic Pulse'}</b>
        <button class="icon-btn" aria-label="Dismiss" onClick={() => { cloud.dismissInvite(); setCode(null); }}><Icon name="x" /></button>
      </div>
      {!isInstalled() && !isNative() && (
        <div class="small" style="margin-top:6px">
          {installable ? (
            <button class="btn small primary" onClick={async () => { if (await promptInstall()) toast('Installed'); }}><Icon name="download" /> Install app</button>
          ) : ios ? (
            <p>Install it: tap <b>Share</b> in Safari, then <b>Add to Home Screen</b>.</p>
          ) : (
            <p>Install it: open the browser menu (⋮) and choose <b>Install app</b> or <b>Add to Home screen</b>.</p>
          )}
          {apk && !ios && <p style="margin-top:6px">Android: you can also <a href={apk}>download the app (APK)</a>.</p>}
        </div>
      )}
      <p class="small" style="margin-top:6px">Set up below. You can sign in later from Settings → Account & devices to use Pulse on several devices.</p>
    </div>
  );
}
