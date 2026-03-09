// One-time password reset script
// Usage: node scripts/reset-password.mjs <email> <new-password>
// Example: node scripts/reset-password.mjs bhatiaaman.p@gmail.com MyNewPass123

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');

const [,, email, newPassword] = process.argv;

if (!email || !newPassword) {
  console.error('Usage: node scripts/reset-password.mjs <email> <new-password>');
  process.exit(1);
}
if (newPassword.length < 8) {
  console.error('Password must be at least 8 characters');
  process.exit(1);
}

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const NS          = process.env.REDIS_NAMESPACE || 'tradingverse';

async function redisGet(key) {
  const res  = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : null;
}

async function redisSet(key, value) {
  const encoded = encodeURIComponent(JSON.stringify(value));
  const res = await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}/${encoded}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
  const data = await res.json();
  return data.result === 'OK';
}

const userKey = `${NS}:user:${email.toLowerCase()}`;
const user = await redisGet(userKey);

if (!user) {
  console.error(`No account found for ${email}`);
  process.exit(1);
}

const hash = await bcrypt.hash(newPassword, 12);
user.hash = hash;

const ok = await redisSet(userKey, user);
if (ok) {
  console.log(`✅ Password reset for ${email}`);
} else {
  console.error('Failed to update Redis');
  process.exit(1);
}
