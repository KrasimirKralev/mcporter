// Reads a deed.page publish_site or rotate_token result (mcporter --output json)
// from stdin, saves a newly returned owner token to ~/.config/deed-page/token
// without printing it, and prints a short summary. A failed call (an MCP error
// such as { code, message }, a { server, tool, issue } envelope, or ok: false)
// is printed to stderr with every token removed and exits 1, so the pipeline
// fails too.
//
// Files are created exclusively with mode 600 in a mode-700 directory, so an
// existing token is never overwritten and nothing is written into the checkout.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = path.join(os.homedir(), '.config', 'deed-page');
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
fs.chmodSync(dir, 0o700);

const save = (name, data) => {
  const file = path.join(dir, name);
  fs.writeFileSync(file, data, { flag: 'wx', mode: 0o600 });
  return file;
};

const input = fs.readFileSync(0, 'utf8');
let result;
try {
  result = JSON.parse(input);
} catch {
  // Keep unparsable output (it may still hold a token) instead of dropping it.
  if (input.trim()) {
    console.error(`Publish output was not JSON; kept it in ${save(`publish-${Date.now()}.json`, input)}`);
  } else {
    console.error('No publish output on stdin.');
  }
  process.exit(1);
}

let saved = null;
if (typeof result?.token === 'string' && result.token) {
  try {
    saved = save('token', result.token);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    saved = save(`token-${Date.now()}`, result.token);
    console.error(`A token already exists, so the new one was saved to ${saved}`);
  }
}

if (result === null || typeof result !== 'object' || result.ok !== true) {
  // Keep every other error field, but drop `token` keys at any depth and mask
  // any owner-token string, so the failure output never contains the secret.
  const redact = (value) => {
    if (typeof value === 'string') return value.replace(/deed_tok_[A-Za-z0-9_-]+/g, '<redacted>');
    if (Array.isArray(value)) return value.map(redact);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => key !== 'token')
          .map(([key, item]) => [key, redact(item)])
      );
    }
    return value;
  };
  console.error(JSON.stringify(redact(result && typeof result === 'object' ? result : { result }), null, 2));
  process.exit(1);
}

const { ok, url, slug, version, expires_at } = result;
console.log(JSON.stringify({ ok, url, slug, version, expires_at, token_saved_to: saved }, null, 2));
