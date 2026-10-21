import { parseProfiles, type HomeProfile } from './homeowner-passport';

export const HOME_BACKUP_FORMAT = 'ascent-homeowner-backup-1';
export const MAX_BACKUP_BYTES = 16_000_000;

/** Backups preserve original evidence and frozen calculations, without replaying a newer engine. */
export function createHomeBackup(profiles: HomeProfile[]) {
  const checked = parseProfiles(JSON.stringify({ version: 1, profiles }));
  if (!checked.length) throw new Error('Save a home before downloading a backup.');
  const backup = { format: HOME_BACKUP_FORMAT, version: 1 as const, profiles: checked };
  if (new TextEncoder().encode(JSON.stringify(backup, null, 2)).byteLength > MAX_BACKUP_BYTES)
    throw new Error('This backup exceeds the supported file size.');
  return backup;
}

export function parseHomeBackup(raw: string): HomeProfile[] {
  if (new TextEncoder().encode(raw).byteLength > MAX_BACKUP_BYTES)
    throw new Error('This file is too large. Choose an Ascent backup smaller than 16 MB.');
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('This file is not valid JSON. Choose an Ascent private backup.');
  }
  if (!data || data.format !== HOME_BACKUP_FORMAT)
    throw new Error('Choose an Ascent private backup. Passport and history reports are not restorable backups.');
  try {
    const profiles = parseProfiles(JSON.stringify({ version: data.version, profiles: data.profiles }));
    if (!profiles.length) throw new Error('Empty backup');
    return profiles;
  } catch {
    throw new Error('This backup is incomplete, damaged, or unsupported. Your saved homes have not changed.');
  }
}

/** Merge all or nothing. Existing versions and their order always survive. */
export function mergeHomeBackup(current: HomeProfile[], incoming: HomeProfile[]) {
  const validate = (profiles: HomeProfile[]) => parseProfiles(JSON.stringify({ version: 1, profiles }));
  const next = validate(current);
  let added = 0;
  let skipped = 0;
  for (const profile of validate(incoming)) {
    const existing = next.find(p => p.propertyId === profile.propertyId);
    if (!existing) {
      if (next.length >= 10) throw new Error('This backup would exceed ten saved homes. Nothing was restored.');
      const unique = [...new Map(profile.snapshots.map(s => [s.id, s])).values()];
      next.push({ ...profile, snapshots: unique.sort((a, b) => Date.parse(a.savedAt) - Date.parse(b.savedAt)) });
      added += unique.length;
      skipped += profile.snapshots.length - unique.length;
      continue;
    }
    const ids = new Set(existing.snapshots.map(s => s.id));
    const additions = profile.snapshots.filter(s => {
      if (ids.has(s.id)) {
        skipped++;
        return false;
      }
      ids.add(s.id);
      return true;
    });
    if (existing.snapshots.length + additions.length > 10)
      throw new Error('This backup would exceed ten versions for a home. Nothing was restored.');
    // Keep the current working version last, even when restoring an older or newer backup.
    existing.snapshots = [
      ...additions.sort((a, b) => Date.parse(a.savedAt) - Date.parse(b.savedAt)),
      ...existing.snapshots,
    ];
    added += additions.length;
  }
  return { profiles: validate(next), added, skipped };
}
