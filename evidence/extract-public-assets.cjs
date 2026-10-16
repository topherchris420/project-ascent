const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = __dirname;
const bundle = JSON.parse(fs.readFileSync(path.join(root, 'rea-public-home-bundle.json'), 'utf8'));
const output = path.join(root, 'public-bundles');
fs.mkdirSync(output, { recursive: true });
const manifest = [];
for (const record of bundle.records) {
  const events = record.normalized_result?.events?.items || [];
  const responses = new Map(events.filter(event => event.kind === 'response').map(event => [event.sequence, event]));
  for (const event of events) {
    if (event.kind !== 'network-content' || event.phase !== 'response' || event.body.state !== 'captured') continue;
    const response = responses.get(event.source_event_sequence);
    if (!response || response.resource_type !== 'script') continue;
    const url = new URL(response.url.url);
    if (url.origin !== 'https://homesolo.ai' || !url.pathname.endsWith('.js')) continue;
    const bytes = Buffer.from(event.body.content, 'base64');
    const file = path.basename(url.pathname);
    fs.writeFileSync(path.join(output, file), bytes);
    manifest.push({ file, url: response.url.url, evidence_id: record.evidence_id, transaction_id: event.transaction_id, source_event_sequence: event.source_event_sequence, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
  }
}
fs.writeFileSync(path.join(root, 'public-bundles-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest.map(({file, bytes}) => ({file, bytes})), null, 2));
