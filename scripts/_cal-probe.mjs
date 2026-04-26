import { encode } from "@auth/core/jwt";
const SECRET = process.env.AUTH_SECRET;
if (!SECRET) { console.error("AUTH_SECRET missing"); process.exit(1); }
const ali = { sub: "d0381435-af9b-4286-9c7a-7fbe0aa5f1cd", email: "ali@kineo360.work", name: "Ali Peters", preferredUsername: "ali", mailbox: "ali@kineo360.work", groups: ["/corehub/dev-ops","/kineo/executives","/medtheris/sales"] };
const t = await encode({
  token: { ...ali, iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600 },
  secret: SECRET,
  salt: "__Secure-authjs.session-token",
  maxAge: 3600,
});
for (const ws of ["corehub","medtheris","kineo"]) {
  const r = await fetch("http://localhost:3000/api/calendar/calendars?workspace="+ws, {
    headers: { Cookie: "__Secure-authjs.session-token="+t, Host: "app.kineo360.work", "X-Forwarded-Proto": "https" },
  });
  const j = await r.json();
  console.log(`${ws}: status=${r.status} cals=${(j.calendars||[]).length} err=${j.error||""}`);
  for (const c of (j.calendars||[]).slice(0,3)) console.log(`  ${c.url||c.name}  ${c.displayName||""}`);
}
