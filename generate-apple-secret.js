// Mints a Sign in with Apple `client_secret` JWT.
//
// US-614: every input is read from the environment. Nothing in this file is a
// secret, and nothing secret may ever be pasted back into it — the previous
// version inlined the signing key as a PEM literal, which put a live Apple
// private key into git history. Load the values from Infisical before running:
//
//   npm run infisical:load          # writes .env.local (git-ignored)
//   set -a && . ./.env.local && set +a
//   node generate-apple-secret.js
//
// APPLE_PRIVATE_KEY holds the contents of the .p8 downloaded from the Apple
// Developer portal. Shells mangle real newlines in env vars, so the literal
// two-character sequence `\n` is accepted and expanded.
//
// `jsonwebtoken` is deliberately NOT a dependency of the web app — this is an
// occasional operator utility, so it is imported dynamically below, after the
// environment is validated. That way a missing env var reports as a missing env
// var rather than as a module-resolution stack trace.

/** Read a required env var or exit with an actionable message. */
function required(name, hint) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    console.error(`Missing ${name}. ${hint}`);
    console.error('Load secrets first: npm run infisical:load && set -a && . ./.env.local && set +a');
    process.exit(1);
  }
  return value.trim();
}

const TEAM_ID = required('APPLE_TEAM_ID', 'Apple Developer portal, top right.');
const KEY_ID = required('APPLE_KEY_ID', 'The Key ID shown when the .p8 signing key was created.');
const CLIENT_ID = required('APPLE_CLIENT_ID', 'Your Service ID, e.g. com.example.signin.');
const PRIVATE_KEY = required(
  'APPLE_PRIVATE_KEY',
  'Contents of the AuthKey_<KEY_ID>.p8 file (PEM).',
).replace(/\\n/g, '\n');

if (!PRIVATE_KEY.includes('BEGIN PRIVATE KEY')) {
  console.error('APPLE_PRIVATE_KEY does not look like a PEM private key (no "BEGIN PRIVATE KEY").');
  process.exit(1);
}

let jwt;
try {
  ({ default: jwt } = await import('jsonwebtoken'));
} catch {
  console.error('jsonwebtoken is not installed. Run: npm i -g jsonwebtoken  (or npx -p jsonwebtoken node generate-apple-secret.js)');
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);

const token = jwt.sign(
  {
    iss: TEAM_ID,
    iat: now,
    exp: now + 15777000, // 6 months (Apple's maximum)
    aud: 'https://appleid.apple.com',
    sub: CLIENT_ID,
  },
  PRIVATE_KEY,
  {
    algorithm: 'ES256',
    header: {
      alg: 'ES256',
      kid: KEY_ID,
    },
  }
);

console.log('Your Client Secret (JWT):');
console.log(token);
