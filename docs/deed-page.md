---
summary: 'Publish an HTML page or a folder of files to a public URL on deed.page through an isolated HTTP MCP configuration.'
read_when:
  - 'Turning generated HTML into a shareable link from a script or agent'
---

# deed.page static publishing

[deed.page](https://deed.page/docs) hosts static files at a public HTTPS URL and exposes publishing over Streamable HTTP at `https://deed.page/mcp`. No account or API key is needed to publish. Everything you publish is public on the web.

The [example configuration](https://github.com/openclaw/mcporter/blob/main/examples/deed-page/mcporter.json) registers a `deedpage` server and disables editor imports. Passing it explicitly with `--config` keeps these commands separate from your project and user configuration.

## Run from a checkout

Use Node 24 or 26 and the pnpm version declared in `package.json`. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
node dist/cli.js --config examples/deed-page/mcporter.json list deedpage --schema
```

Publish a one-file page that expires after an hour. The first publish without a token returns an owner token once. The command below reuses a token already saved in `~/.config/deed-page/token` (for example by the deed.page agent skill), so the new site stays under the same owner, and pipes the result to [`save-token.mjs`](https://github.com/openclaw/mcporter/blob/main/examples/deed-page/save-token.mjs), which saves a newly returned token without printing it and never overwrites an existing one. If the call fails, the helper prints the error (without any token) to stderr and exits 1:

```sh
TOKEN_FILE="$HOME/.config/deed-page/token"
set --
if [ -s "$TOKEN_FILE" ]; then set -- "token=@$TOKEN_FILE"; fi
node dist/cli.js --config examples/deed-page/mcporter.json call deedpage.publish_site \
  --args '{"files":{"index.html":"<!doctype html><title>Hello from mcporter</title><h1>Hello from mcporter</h1>"},"ttl_seconds":3600}' \
  "$@" --output json | node examples/deed-page/save-token.mjs
```

Check that the page is live:

```sh
node dist/cli.js --config examples/deed-page/mcporter.json call deedpage.get_site \
  --args '{"slug":"<slug from the publish result>"}'
```

The publish result includes `url`, `slug`, `version` and `expires_at`. Omit `ttl_seconds` for a permanent site, and pass `slug` to choose the subdomain instead of getting a random one.

## Owner token

The token from the first anonymous `publish_site` call is shown once. It is the owner credential for every site published with it: `update_site`, `delete_site`, `list_sites`, `rotate_token` and `revoke_token` take it as the `token` argument.

Store it where the deed.page agent skill does: `~/.config/deed-page/token`, file mode 600, in a directory with mode 700, holding only the token with no trailing newline. Never put it in `mcporter.json`, a repository, a published page or a log, and never type it into a command line, where it lands in shell history and is visible to other local users in the process list.

Pass it with MCPorter's file-backed argument syntax instead. `token=@path` reads the file's exact contents as the `token` value, so the secret never appears in argv or in shell history:

```sh
node dist/cli.js --config examples/deed-page/mcporter.json call deedpage.list_sites \
  "token=@$HOME/.config/deed-page/token"

node dist/cli.js --config examples/deed-page/mcporter.json call deedpage.delete_site \
  slug=<slug> "token=@$HOME/.config/deed-page/token"
```

To send a whole JSON payload that includes the token, build it from the token file and pipe it straight to `--args -`, which reads a JSON object from stdin. Nothing is written to disk and the token never reaches argv:

```sh
node -e '
const fs = require("node:fs");
const token = fs.readFileSync(`${process.env.HOME}/.config/deed-page/token`, "utf8");
process.stdout.write(JSON.stringify({ slug: process.argv[1], token }));
' <slug> | node dist/cli.js --config examples/deed-page/mcporter.json call deedpage.delete_site --args -
```

Anyone who has the owner token has full control of that owner's sites: they can replace their files, delete them, list them, and rotate or revoke the token itself. Public visibility of a page does not make its token public. If the token leaks, rotate it with `rotate_token` (`POST /v1/tokens/rotate`), which returns a new token once for the same owner and stops the old one immediately unless you set `overlap_seconds` (0 to 300). Pipe its `--output json` result to `save-token.mjs` as well instead of printing it. Because a token file already exists, the new token is saved next to it as `token-<timestamp>`; move it over `token` after checking it with `list_sites`:

```sh
node dist/cli.js --config examples/deed-page/mcporter.json call deedpage.rotate_token \
  "token=@$HOME/.config/deed-page/token" --output json | node examples/deed-page/save-token.mjs
```

To shut access off instead, use `revoke_token` (`POST /v1/tokens/revoke`) with scope `current` or `all`; the sites stay online, but unless a recovery email was attached they can no longer be updated or deleted. See the [deed.page docs](https://deed.page/docs) for details.

Use `list deedpage --schema` to see the other tools (versions and restore, custom domains, password protection) and their current arguments.

## Use your own configuration

Copy the `deedpage` server entry into your existing `mcpServers` map to use it alongside other servers. Keep your existing `imports` setting. The example adds no authorization header or environment placeholder, so no deed.page credentials are needed to start.
