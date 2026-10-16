const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = __dirname;
const bundle = JSON.parse(fs.readFileSync(path.join(root, 'rea-final-bundle.json'), 'utf8'));
const index = [];
for (const record of bundle.records) {
  for (const step of record.normalized_result?.steps || []) {
    const item = { evidence_id: record.evidence_id, step_id: step.step_id, url: step.after_url?.url, status: step.status, error: step.error, artifact_files: {} };
    for (const type of ['dom', 'accessibility']) {
      const artifact = step.artifacts?.[type];
      if (artifact?.state !== 'captured') continue;
      const file = record.evidence_id.slice(0, 15) + '-' + step.step_id + (type === 'dom' ? '.html' : '.txt');
      fs.writeFileSync(path.join(root, file), artifact.value.text);
      item.artifact_files[type] = { file, sha256: artifact.value.sha256 };
    }
    const screenshot = step.artifacts?.screenshot;
    if (screenshot?.state === 'captured') {
      const file = record.evidence_id.slice(0, 15) + '-' + step.step_id + '.png';
      fs.writeFileSync(path.join(root, file), Buffer.from(screenshot.value.data_base64, 'base64'));
      item.artifact_files.screenshot = { file, sha256: screenshot.value.sha256 };
    }
    index.push(item);
  }
}
fs.writeFileSync(path.join(root, 'capture-index.json'), JSON.stringify(index, null, 2));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public-bundles-manifest.json'), 'utf8'));
const snippets = [];
for (const artifact of manifest) {
  const text = fs.readFileSync(path.join(root, 'public-bundles', artifact.file), 'utf8');
  for (const match of text.matchAll(/['"]\/api\/[^'"\s]+/g)) {
    snippets.push({ file: artifact.file, sha256: artifact.sha256, source_evidence_id: artifact.evidence_id, transaction_id: artifact.transaction_id, utf16_offset: match.index, endpoint_literal: match[0].slice(1), snippet: text.slice(Math.max(0, match.index - 80), match.index + 400), classification: 'manual static string observation; runtime reachability and server behavior unverified' });
  }
}
fs.writeFileSync(path.join(root, 'manual-static-endpoints.json'), JSON.stringify(snippets, null, 2));
console.log(JSON.stringify({records: bundle.records.length, steps: index.length, endpoint_literal_occurrences: snippets.length, screenshots: index.filter(x => x.artifact_files.screenshot).map(x => x.artifact_files.screenshot.file)}, null, 2));
