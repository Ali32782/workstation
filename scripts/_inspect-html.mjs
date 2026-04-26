import { encode } from "@auth/core/jwt";
const t = await encode({
  token: { sub:"d0381435-af9b-4286-9c7a-7fbe0aa5f1cd", email:"ali@kineo360.work", name:"Ali", preferredUsername:"ali", mailbox:"ali@kineo360.work", groups:["/corehub/dev-ops","/kineo/executives","/medtheris/sales"], iat:Math.floor(Date.now()/1000), exp:Math.floor(Date.now()/1000)+3600 },
  secret: process.env.AUTH_SECRET, salt: "__Secure-authjs.session-token", maxAge: 3600,
});
const cookieStr = `__Secure-authjs.session-token=${t}; authjs.session-token=${t}`;
const paths = ["/kineo/mail","/kineo/chat","/kineo/calendar","/sign","/admin"];
for (const p of paths) {
  const r = await fetch(`http://localhost:3000${p}`, { headers:{Cookie:cookieStr, Host:"app.kineo360.work", "X-Forwarded-Proto":"https"}, redirect:"manual" });
  const h = await r.text();
  const matches = h.match(/(sm:|md:|lg:|xl:|2xl:)[a-z0-9-]+/g) || [];
  const flexCount = (h.match(/flex/g) || []).length;
  const gridCount = (h.match(/grid/g) || []).length;
  const loc = r.headers.get("location") || "";
  console.log(`${p} → ${r.status} ${loc?"→ "+loc:""} len=${h.length} responsive=${matches.length} flex=${flexCount} grid=${gridCount}`);
  if (matches.length===0 && r.status===200) {
    console.log("    sample HTML head:", h.slice(0, 400).replace(/\s+/g," "));
  }
}
