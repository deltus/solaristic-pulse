// What to do automatically when a device signs in, so records reach the cloud without a hidden switch.

export interface SyncSituation { accountHasKey: boolean; deviceHasKey: boolean; cloudRows: number; localClasses: number }

/**
 * createKeyAndUpload: the account's first synced device: make the key, upload everything.
 * upload: the account has a key but no records yet: upload this device's records.
 * download: this device has no classes: copy the account's records here.
 * needKey: the account's key isn't on this device yet: ask for the recovery key or the QR code.
 * choose: both sides have records: ask whether to combine them or use the account's.
 */
export type AutoPlan = 'createKeyAndUpload' | 'upload' | 'download' | 'needKey' | 'choose';

export function planAutoSync(s: SyncSituation): AutoPlan {
  if (!s.accountHasKey) return 'createKeyAndUpload';
  if (!s.deviceHasKey) return 'needKey';
  if (s.cloudRows === 0) return 'upload';
  if (s.localClasses === 0) return 'download';
  return 'choose';
}
