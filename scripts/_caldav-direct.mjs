import crypto from "node:crypto";
const SECRET = process.env.DERIVED_PASSWORD_SECRET;
function pw(user) {
  const m = crypto.createHmac("sha256", SECRET).update("nextcloud:" + user).digest("base64url");
  return "A!a" + m.slice(0, 28) + "#9";
}
async function probe(host, user) {
  const auth = Buffer.from(user + ":" + pw(user)).toString("base64");
  const url = `http://${host}/remote.php/dav/calendars/${user}/`;
  console.log(`\n── ${url} (user=${user}) ──`);
  const r = await fetch(url, {
    method: "PROPFIND",
    headers: { Authorization: "Basic " + auth, Depth: "1", "Content-Type": "application/xml" },
    body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/></d:prop></d:propfind>`,
  });
  const text = await r.text();
  console.log("status=" + r.status, "len=" + text.length);
  // Count <d:response> elements
  const matches = text.match(/<d:response>/g);
  console.log("responses=" + (matches?.length ?? 0));
  console.log(text.slice(0, 800));
}
for (const [host, user] of [
  ["nextcloud-corehub", "ali"],
  ["nextcloud-corehub", "Ali"],
  ["nextcloud-corehub", "testuser1"],
  ["nextcloud-medtheris", "ali"],
  ["nextcloud-medtheris", "testuser1"],
]) {
  try { await probe(host, user); } catch (e) { console.log("err:", e.message); }
}
