const fetch = require('node-fetch');
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function test() {
  const enc = encodeURIComponent(JSON.stringify({ "foo": "bar" }));
  const res = await fetch(`${REDIS_URL}/set/test_key/${enc}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
  console.log("Status:", res.status);
  console.log("Body:", await res.text());
}
test();
