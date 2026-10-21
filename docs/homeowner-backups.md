# Private home backups

My Home offers **Download private backup** and **Choose a private backup to restore**. A backup preserves all saved homes, original evidence, studio choices, financial inputs, notes, and frozen calculation summaries. This makes device-local decisions recoverable after moving browsers or clearing storage, provided the homeowner downloaded a backup first.

## Restore behavior

1. Choose the JSON file downloaded by **Download private backup**. Reading a file does not write storage.
2. Review the addresses and saved version counts. Cancel to leave storage unchanged.
3. Select **Restore saved decisions**. The app re-reads current storage, validates and merges the whole backup, then makes one storage write. Identical snapshot IDs are skipped. Current working versions stay last for existing homes, even if an imported version is newer. Imported versions remain available in Reports & History. New homes use their newest saved version.

The existing limits remain ten homes, ten versions per home, and four million characters for persisted profiles. Restore never evicts history to make room. Invalid JSON, unsupported formats, changed snapshot checksums, unrecognized sources, foreign return links, and capacity failures leave existing storage intact. A failed browser storage write does not claim success. The file size limit is 16 MB; persisted content must also pass the stricter profile limit.

## Privacy and compatibility

Backups use `ascent-homeowner-backup-1`. They are unencrypted and contain private financial assumptions and notes. All file reading and validation occurs in the browser; no upload, account, provider, or database is involved. Checksums detect accidental changes; they are not signatures or proof that imported records are authentic. Only restore files you trust.

Existing evidence passports and history exports remain reports for reading and sharing. They do not contain the complete original storage representation and cannot be restored with this feature. Privacy-filtered reports still omit finances and notes by default. Download a private backup from My Home before moving devices.

Concurrent tabs are re-read immediately before committing a restore. Browser localStorage does not provide transactions across tabs; simultaneous writes from other tabs remain a limitation. This is manual backup and recovery, not account synchronization.

## Verification

`tests/homeowner-backup.test.ts` covers exact round-trip recovery, duplicate handling, working-version retention, mutation safety, damaged files, unsafe links, source restrictions and capacity rejection. `tests/e2e/homeowner-backup.spec.ts` exercises the actual downloaded file, preview/cancel, recovery after storage removal, repeat restore, invalid JSON, reopening the restored home, accessibility and layout at desktop and phone widths.
