# Self-hosting openGym

openGym is two small containers (a web server and an API) plus a folder of your data.
This guide takes you from "just cloned it" to "using it from my phone over the internet".

## 1. Run it locally (5 minutes)

Requirements: [Docker](https://docs.docker.com/get-docker/) with the Compose plugin.

```bash
git clone https://github.com/alexpcosta/opengym
cd opengym
cp .env.example .env
docker compose pull   # prebuilt images from ghcr.io (amd64 + arm64) — or skip and build from source
docker compose up -d
```

- First start downloads the exercise images/GIFs (~140 MB) once into `app/img` and `app/gif`.
- Open **http://localhost:8080** and create a profile with a passkey.
- Rather build from source than pull prebuilt images? Skip `docker compose pull` and run
  `docker compose up -d --build` instead — no Node needed locally either way.

Check it's healthy:

```bash
docker compose ps
curl http://localhost:8080/api/health      # {"ok":true,...}
```

Logs: `docker compose logs -f`. Stop: `docker compose down`.

## 2. Understand the passkey requirement (important)

openGym signs you in with **passkeys** (WebAuthn). Browsers enforce two rules:

1. Passkeys are bound to an exact **hostname** (`RP_ID`).
2. They only work over **HTTPS** — with one exception: `http://localhost`.

So `http://localhost:8080` works on the machine running Docker, but **another device (your
phone) cannot use `http://<your-LAN-ip>:8080`** — that's neither localhost nor HTTPS, so the
passkey prompt won't appear. To use openGym from your phone you need a real HTTPS hostname.

(You can still open it over LAN in **guest mode**, which stores data only in that browser.)

## 3. Expose it over HTTPS on your own domain

Put openGym behind something that terminates TLS for a hostname you control, then point it at
the `web` container. Pick whichever you already run:

### Option A — Cloudflare Tunnel (no open ports)

1. Create a tunnel and route `gym.example.com` → `http://<docker-host>:8080`.
2. Cloudflare gives you HTTPS automatically.

### Option B — Caddy (automatic Let's Encrypt)

```caddy
gym.example.com {
    reverse_proxy localhost:8080
}
```

### Option C — Traefik / nginx / Nginx Proxy Manager

Route `gym.example.com` (HTTPS) → `web:80` (or `<docker-host>:8080`). Any reverse proxy works —
openGym only needs the browser to reach it over `https://gym.example.com`.

Then set your domain in `.env` and restart:

```bash
# .env
RP_ID=gym.example.com
ORIGIN=https://gym.example.com
WEB_PORT=8080
RP_NAME=openGym
```

```bash
docker compose up -d
```

Visit `https://gym.example.com`, create your profile, and add it to your home screen
(iOS: Share → Add to Home Screen · Android: ⋮ → Add to Home screen).

> Changing `RP_ID` later invalidates existing passkeys (they were bound to the old hostname).
> Pick your domain before people register.

## 4. Multiple users

Anyone who can reach the URL can create their own profile — each gets isolated data. That's the
default: open signup, no admin.

If you'd rather control who gets in, two optional settings in `.env` turn that around:

```bash
ADMIN_UIDS=youruserid      # comma-separated; these users get the admin dashboard
INVITE_ONLY=1              # new profiles need an invite code
```

Register your own passkey profile first, then find your id in `./data/db.json` under `users[].id`
and put it in `ADMIN_UIDS`. You'll get an **Admin dashboard** link in Settings: who's training
right now, each user's workout history and body weight, the ability to disable an account (signed
out and locked out everywhere until you re-enable it), and — with `INVITE_ONLY=1` — generating and
revoking invite codes. Existing accounts keep working when you switch invite-only on. Admin access
is gated by your passkey and enforced server-side, so it needs no separate login.

Prefer to keep the whole thing off the open internet? A VPN or an auth proxy (Authelia, Cloudflare
Access…) in front still works, and composes with the above.

## 5. Backups

Everything is in `./data`:

```bash
tar czf opengym-backup-$(date +%F).tar.gz data/
```

That archive contains all profiles, passkeys and workout history. Restore by unpacking it back
into the project folder. (Individual users can also export their own data as JSON from Settings.)

## 6. Notifications

openGym can push two kinds of alert to your phone/desktop, even when the app isn't open:
rest-timer-over, and a reminder on days you have a workout planned but haven't logged one yet.
Turn it on per-profile in **Settings → Notifications** (requires a signed-in passkey profile and
HTTPS — see section 3).

No setup needed server-side, and nothing to configure per timezone: VAPID keys are generated on
first run and saved to `./data/vapid.json`, and each user's browser reports its own timezone
automatically when they turn the reminder on — it fires at their local time, and follows them if
they travel, regardless of what timezone the server itself runs in.

**Keep screen awake** (Settings → *During a workout*) has the same transport requirement: the
Wake Lock API is only available over HTTPS or on `http://localhost`, so on a plain-LAN-IP
instance the switch shows as unsupported. Nothing to configure server-side either way, and iOS
refuses the lock while the phone is in Low Power Mode.

## 7. Updating

Running prebuilt images:

```bash
git pull                    # picks up compose/config changes
docker compose pull
docker compose up -d
```

Building from source instead:

```bash
git pull
docker compose up -d --build
```

The app shell is versioned (`?v=N`) so clients pick up changes on next load. Your `./data` and the
downloaded media are untouched.

## 8. The AI Coach (optional)

The Coach is an AI that designs training plans and reviews them against what your users
actually log. It is **off on a fresh instance**, and turning it on is entirely a dashboard job
— there is nothing to install and nothing to put in `.env`.

### What you are signing up for

The account is yours: every plan or review is one session on the provider account you connect,
so budget for it and use the caps below. The built-in choices are Claude's official Agent SDK
and a pinned OpenAI Codex CLI. Neither requires an API key: Claude uses an owner-created setup
token, while Codex uses ChatGPT's device-code sign-in and stores its refreshable CLI cache only
in the private `./data/codex` volume. Use the Codex option only on a trusted, owner-controlled
server; that cache is equivalent to a password and must not be exposed to users or public code.

### Turning it on

1. Open **Settings → Admin dashboard → AI Coach** and flip the switch.
2. Pick one built-in provider:
   - **Claude Code**: on a trusted computer where you use Claude Code, run `claude setup-token`.
     Complete its normal browser sign-in, copy the printed token, then choose **Add CLI token**
     in openGym. The token is encrypted at rest and passed only to the isolated Agent SDK job.
   - **OpenAI Codex CLI**: choose **Sign in with ChatGPT**, then use the link and one-time code
     on a trusted browser or iPad. This is Codex's device-code login; openGym never receives a
     ChatGPT password, API key, browser callback, or access token. Its private CLI cache lives
     in `./data/codex` and is refreshed by Codex itself.
3. Hit **Test the Coach**. Green means a real round-trip to the selected provider worked.

The card then shows the runtime, credential state, jobs run today and the last failure, if any.
For the complete no-API-key Codex flow, see [ChatGPT-setup-instructions.md](../ChatGPT-setup-instructions.md).

### Limits

Set a per-user daily cap (default 10) and, on a shared instance, an instance-wide one. Both
are in the same card; `0` means no limit. Nothing else meters spend, so these are worth
setting before you hand the instance to a family.

### What your users see

Nothing, until they opt in. Each profile gets a **Meet the Coach** card explaining exactly
which categories of their data would leave the server, naming the provider, and stating that
it runs under your account. Declining leaves the app exactly as it was.

You cannot read their intake answers, their payloads or their proposals — the admin card shows
counts, timings and error classes only. That is deliberate: enabling a feature and reading
people's training notes are different powers.

### What leaves the box

Only the profile that asked, and only: their plan, the training window under review, their
weigh-ins and goal weight, their intake answers, and their unit/language/effort scale. Names,
passkeys, push subscriptions and every other profile's data stay here. The job itself runs as
an unprivileged user that cannot read `./data` at all — the CLI sees its own payload and
nothing else.

### Trying it without an account

Select the **Fixture (testing)** provider. It answers with a canned but structurally real
proposal, so you can walk the whole loop — intake, proposal, accept, revert — before
connecting anything that costs money.

### When it breaks

| Symptom | Fix |
|---|---|
| "The Coach couldn't sign in to its provider" | For Claude, replace the setup token. For Codex, disconnect and complete **Sign in with ChatGPT** again. |
| "The Coach isn't installed properly" | A bundled provider runtime is missing — rebuild the API image with `docker compose up -d --build`. |
| "The Coach is resting" | A daily cap was hit. Raise it, or wait. |
| "answered with something the app couldn't use" | The model produced output that failed validation twice. Usually transient; try again. |
| Everything is grey and says force-disabled | `COACH_DISABLED=1` is set in the environment. |

Users never see the provider's own error text — that goes to the admin card, where someone can
act on it.

## Troubleshooting

| Symptom | Fix |
|---|---|
| No passkey prompt on my phone | You're on `http://` or an IP, not HTTPS. Set up a domain (section 3). |
| "verification failed" on login | `RP_ID`/`ORIGIN` don't match the URL in the address bar. Make them exact, restart. |
| Media didn't download | `docker compose logs media`. Re-run `docker compose up -d`, or run `./scripts/fetch-media.sh`. |
| Port 8080 already used | Set `WEB_PORT=9090` in `.env` (and update `ORIGIN` for local testing). |
| No "Notifications" option in Settings | Requires a signed-in profile and HTTPS (or `localhost`) — guest mode and plain HTTP over LAN can't subscribe. |
| Day reminder fires at the wrong time | Toggle it off and on in Settings so it re-detects your browser's timezone (also happens automatically on every app load — see section 6). |
| Want to reset a stuck login | Delete the cookie in your browser; sessions are just signed cookies. |
| `docker compose pull` fails with "denied" / "unauthorized" | The prebuilt images aren't published yet, or need to be, or the GHCR package is still private — build from source instead (`docker compose up -d --build`). |
