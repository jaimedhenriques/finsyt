#!/usr/bin/env node
// Git credential helper that fetches the GitHub access token from the
// Replit connectors proxy on demand. This avoids storing tokens in
// .git/config or remote URLs and lets the token rotate transparently.
//
// Wired up via:
//   git config credential.https://github.com.helper "!node $PWD/scripts/git-credential-replit-github.mjs"
//
// Git invokes us with one argv: "get" | "store" | "erase".
// We only implement "get"; store/erase are no-ops because the upstream
// store of record is the Replit connector, not Git.

const action = process.argv[2];
if (action !== "get") process.exit(0);

const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
if (!hostname) {
  console.error("git-credential-replit-github: REPLIT_CONNECTORS_HOSTNAME not set");
  process.exit(1);
}

const identity = process.env.REPL_IDENTITY
  ? "repl " + process.env.REPL_IDENTITY
  : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

if (!identity) {
  console.error("git-credential-replit-github: no REPL_IDENTITY or WEB_REPL_RENEWAL");
  process.exit(1);
}

try {
  const url = `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=github`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", X_REPLIT_TOKEN: identity },
  });
  if (!res.ok) {
    console.error(`git-credential-replit-github: connectors API ${res.status}`);
    process.exit(1);
  }
  const data = await res.json();
  const token = data.items?.[0]?.settings?.access_token;
  if (!token) {
    console.error("git-credential-replit-github: no access_token in connector response");
    process.exit(1);
  }
  process.stdout.write(`username=x-access-token\npassword=${token}\n`);
} catch (err) {
  console.error(`git-credential-replit-github: ${err?.message || err}`);
  process.exit(1);
}
