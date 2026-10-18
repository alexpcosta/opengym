# Changelog

## Unreleased

### Trainer mode and the food diary

openGym tracked one person's training. It can now be a personal trainer's tool: the instance's
admins plan for everyone else, and see what they do. And it tracks what you eat, not only what
you lift. **[Guide →](docs/TRAINER.md)**

- 🧑‍🏫 **Plans written by your trainer.** An admin builds a student's week and routines with the
  same editor as their own plan (or copies their own) and sends it. It lands on the student's
  phone by itself, read-only there, with a note; routine ids survive edits, so history and
  progression stay attached. The student can still move a single day.
- 🔔 **The trainer hears about it.** Workout finished (with duration, sets, volume), a new PR,
  a planned day skipped, no food logged, a day off target, and a daily summary — as pushes in
  the trainer's own language and in a feed. Checks run on each student's own clock, and history
  imports never flood anyone.
- 🥗 **A food diary.** Meals with calories and macros against targets worked out from your goal
  (Mifflin–St Jeor × activity, a capped deficit or surplus, protein by body weight — every step
  shown). Search 593 basic foods offline in Portuguese and Spanish (TACO, NEPA/UNICAMP), packaged
  foods and barcodes through Open Food Facts, your own foods, quick add, copy the previous day.
  The barcode scanner works on iPhone too, with the decoder served by your own instance.
- 📋 **Diets written by your trainer.** Targets from the calculator or typed in, an optional menu
  per meal with alternatives for each food, and foods the trainer adds for everyone. The student
  ticks off what they ate as planned, or swaps; the trainer reads the last 14 days meal by meal.
- Diet replaces Exercises in the tab bar for signed-in profiles; the library is a tap away in the
  Plan header. Guests, the Android app and the demo are unchanged.
- Notification taps now open the screen they are about (this also fixes the Coach's link).

### The AI Coach

openGym could always progress a plan. It could never *write* one, and it never looked at the
plan itself — the engine adjusted your weights inside whatever structure you had built, and the
effort ratings you logged were, by the app's own admission, read by nothing.

The Coach is an optional AI that does both jobs the engine deliberately doesn't: it designs
plans, and it changes them when your training says they should change. It runs as a CLI on your
own server, under your own provider account, and it is off until an admin turns it on.

- 🤖 **It builds you a plan.** A six-screen intake — goal, experience, days, session length,
  equipment, limitations, likes and dislikes — produces a complete weekly plan: routines,
  exercise selection, sets × reps, supersets, the week schedule, and a progression policy per
  routine with per-exercise overrides. Every exercise carries a sentence on why it is there.
  Don't like it? Say so in your own words ("swap the squats for split squats, Mondays are
  short") and the whole plan comes back revised.
- 🔍 **It reads what actually happened.** On demand, or weekly, or after every N sessions: sets
  hit and missed against their targets, effort trends, the stalls and deloads the engine fired,
  sessions you keep moving to another day, session length against the time you said you had,
  body weight against your goal, and muscle groups that got nothing. **Your RIR and RPE ratings
  finally have a reader.**
- ✅ **Changes you approve one at a time.** A review comes back as a list of discrete changes,
  each with a before → after and a rationale naming the evidence — "bench came in at RPE ≥ 9.5
  for three sessions and stalled twice; swapping to dumbbell press for four weeks". Tick the
  ones you want. Advice with no plan change attached goes in a separate notes section and
  applies nothing.
- ↩️ **Nothing is one-way.** Accepting snapshots your plan first, so one tap puts it back.
  Reverting a plan never touches a logged workout — the log is what happened.
- 🚦 **It knows when to say nothing.** A review that finds no reason to change anything says so
  and sends no notification. Suggestions you turn down are remembered, so the next review
  doesn't re-propose them without new evidence.
- 🔒 **The engine still owns your weights.** The Coach sets the plan and the policies; the
  deterministic progression engine still computes every session's target and still tells you
  why. Plans are where judgement lives, targets are where the math lives, and the math stays
  auditable and offline.
- 🧾 **A visible paper trail.** Every job, decision and applied change lands in a per-profile
  Coach log that syncs with your data and travels in your JSON backup.
- ⭐ **How did that feel?** An optional one-tap rating on the finish summary — too easy / about
  right / brutal, plus a note. The Coach reads both.

**For whoever runs the instance.** Both provider runtimes — Claude's Agent SDK and a pinned
OpenAI Codex CLI — ship inside the api image, so there is nothing to install and neither path
needs an API key. Enable the Coach, sign in (a `claude setup-token` you paste, or Codex's
ChatGPT device-code flow) and set spending caps entirely from the admin dashboard — no `.env`
editing, no restart. The card shows runtime version, sign-in state, jobs run today and the last
failure; it never shows anybody's intake answers, payloads or proposals. A **Fixture** provider
walks the entire loop with no AI account at all.

**For everyone else.** An instance with the Coach switched off is the app it was before, to the
byte: no new UI, no new requests, no change to the state you sync. Turning it on adds one
dismissible card until a profile consents, and consent is per profile — the admin enabling the
feature does not enable it for you. The consent screen lists exactly which categories of data
leave the server, names the provider, and says whose account pays. The mobile build has no
server and hides it; the demo runs it against a canned local provider so you can try the loop.

Under the hood: the provider runtime runs as an unprivileged user that cannot read `./data`,
with a scrubbed environment and no tools; every answer is validated against a closed list of
change types and the real exercise library before anyone sees it, with one repair round and
then a clean failure. A pasted Claude setup token is encrypted at rest with a key derived from
the instance secret; Codex's ChatGPT credential stays in Codex's own private cache, mounted
separately from app data and never copied into `coach.json`.

Documented in **[docs/AI_COACH.md](docs/AI_COACH.md)**, with setup walkthroughs for
[Claude](Claude-setup-instructions.md) and [ChatGPT/Codex](ChatGPT-setup-instructions.md) and
the design rationale in [openGym_AI_Strategy.pdf](openGym_AI_Strategy.pdf).

### The effort ratings, read back as statistics

v1.2.3 let you rate how hard a set was. Nothing then read that rating back — it lived in the set
label and nowhere else. Stats now answers the question the number was recorded for.

- 📊 **An Effort card in Stats** over 30d / 90d / 1Y / all time: average effort, the share of sets
  taken close to failure, and — always alongside them — how much of your training was rated at
  all. Rating is optional and off by default, so a partly rated history is normal; an average
  without its denominator would quietly speak for sets you never rated.
- **Week by week.** The weekly average with that week's set count in the tooltip, because the
  pair is the reading: volume up with effort up is fatigue accumulating, volume up with effort
  flat is the adaptation you were training for. Weeks resting on a single rated set are dropped
  rather than drawn.
- **Where the sets land.** The spread across the scale, not just the middle of it. Half your sets
  at failure and half in warm-up territory average out to a healthy-looking number; this is the
  chart that shows it.
- 🔥 **Hard-sets mode on the muscle map.** The same body diagram, counting only sets taken near
  failure — "where did the stimulus go" rather than "where did the volume go". A muscle can lead
  on set count and still never be trained hard.
- **Effort on the exercise curve.** Each session's dot on the top-set chart fills in as less is
  left in the tank, so the same weight moved with more in reserve stops reading as a flat line.
  Exercises with enough ratings also get an Effort curve of their own.
- **One history, whichever scale you use.** Everything aggregates internally in RIR and converts
  back for display, so a history that mixes your own RIR logs with imported RPE averages as one
  series instead of two half-empty ones. RIR charts count downward on the axis, so harder sets
  sit higher.
- Translated into all 12 UI languages.

## v1.2.3 — 2026-07-31

How hard a set was, in whichever of the two scales you already think in — and the ratings your
old app recorded come across with the rest of your history. Plus: the phone stops locking itself
mid-workout, the rest timer can hand time back as well as take it, and Settings is grouped by
what each thing actually affects.

### The screen stays on while you train

- ☀️ **Keep screen awake — Settings → *During a workout*, on by default.** Locking, unlocking
  and finding your place again between every set was the single most annoying thing about
  logging on a phone. The screen now stays lit for as long as a workout is running and lets go
  the moment you finish it, so nothing is held while you are not training.
- **It survives a tab switch.** Browsers release the lock whenever the page stops being visible,
  which is exactly what happens when you glance at a message. The lock is taken again each time
  the app comes back, rather than dying the first time you look away.
- **It follows the workout, not the screen you are on.** Checking Stats mid-session keeps the
  screen awake.
- **Where it isn't available, it says so.** iOS grants no wake lock in Low Power Mode, and older
  browsers have no Wake Lock API at all — the first is silent, the second shows the row disabled
  rather than offering a switch that does nothing. Needs HTTPS, like every other modern browser
  capability.

### Rest timer: take 15 seconds off, too

- ⏳ **A −15s button next to +15s.** The timer could only ever be extended or skipped outright;
  now it goes both ways. Taking off more than is left finishes the rest rather than counting
  into the negative — the same thing Skip does.
- **Rearranged so three controls fit.** The clock and the progress bar take the top row and the
  controls sit underneath: −15 and +15 together in number-line order, Skip pushed to the far
  edge so the button that ends the rest is not next to the one you tap to buy more time. On a
  wide screen it stays on one line. Tap targets are bigger than they were.
- **The bar is nearly opaque.** The set rows underneath were reading through it and making the
  clock hard to pick out.

### Settings, grouped by what it affects

- **General** (language, units) · **During a workout** (rest timer, keep screen awake, sounds,
  effort per set) · **Notifications** · **Appearance** (theme, body diagram, accent) · **Data**.
- The old grouping mixed axes: "Units & timer" put a display preference next to two workout
  behaviours, language sat under Appearance, and *Load starter plan* was buried between the
  backup actions and the destructive reset. Data now reads in the order you would use it — fill
  the plan, bring history over from another app, restore a backup, export one, wipe everything.
- Nothing was removed and no setting changed its meaning.

### Effort per set: RIR or RPE (#21)

- 🎯 **A third column on a working set, off by default.** Settings → *Effort per set* switches
  it between **Off**, **RIR** and **RPE**. It only appears on weighted rep sets: a plank or a
  treadmill row has nowhere to put it.
- **Two names for the same judgement.** RIR counts the reps you left in the tank; RPE reads the
  same effort off a 10-point scale, so RPE ≈ 10 − RIR. The setting has an (i) that lays the two
  scales side by side in a conversion table rather than explaining them in a paragraph.
- **Each set keeps the scale it was logged with.** Switching the setting changes what new sets
  ask for and nothing else — history is never silently rewritten, and a set logged as RIR 2
  still reads back as RIR 2 years later.
- **An unrated set stays unrated.** Blank and 0 are different things: RIR 0 says the set went to
  failure. So `−` on an untouched cell leaves it empty, `+` starts at the bottom of the scale
  and walks up in even steps, and stepping back off the bottom clears the cell again — a mistap
  is always undoable.
- **Nothing else reads the value.** Progression rules and estimated 1RM are unaffected; the
  rating is yours to look at, not an input to the maths.
- Upgrading keeps the column you had: a profile still carrying the old `showRir` flag — from
  this device, a sync, or a backup restored later — comes across as RIR.

### Import brings your ratings with it

- 📥 **The RPE Hevy and Strong export is no longer dropped.** An `RPE` column is read into the
  set, as is an `RIR` column if a file has one, and the import summary says how many sets
  arrived with a rating — plus where to switch the column on if it's off.
- A blank cell stays unrated rather than becoming 0. A written-out `0` counts as a rating on the
  RIR scale (a set to failure) but not on RPE, which starts at 1 — apps write 0 there to mean
  "nothing here", and reading it as an effort would stamp one on every unrated set in the file.
- Ratings above the scale are capped instead of thrown away, and junk in the column is ignored
  without losing the set.
- Backups already carried both fields and the setting, since a backup is the whole state — there
  are now tests pinning that, so it can't quietly stop being true.

## v1.2.2 — 2026-07-25

Training that moves on its own: an exercise can now be logged by time instead of reps, the
next weight follows a progression rule you choose rather than a single hard-coded hint, and
every lift carries an estimated 1RM. Plus a standalone mobile app, a shareable plan, and an
importer for your history from other apps.

### Timed sets and a timer for the set itself (#16)

- ⏱️ **Reps or time, per exercise.** Planks, hangs, wall sits, dead hangs and loaded
  carries no longer have to be filed under cardio to be timed. Each exercise in a routine
  picks its own mode, and a timed set can still carry weight for a weighted plank or a
  farmer's walk.
- ▶️ **A work timer, separate from the rest timer.** Start a timed set and it counts the
  hold down, beeping and buzzing at zero exactly as the rest timer does, then checks the
  set off itself. The two timers can never run at once — they mean opposite things.
- Finishing a hold early logs **the time you actually held**, not the target. A 38-second
  hold against a 45-second target is recorded as 38 seconds.
- The mode travels everywhere it should: routine editor, workout, history, exercise
  statistics (timed exercises chart their longest hold), the printable plan and the shared
  plan file.
- Plans made before this release are read exactly as they always were — nothing to migrate.

### Progression rules you can read (#17)

- 📈 **Pick a rule per routine, override it per exercise.** Linear progression, **Greyskull
  LP** (two straight sets plus an AMRAP final set, with double jumps and a 10 % reset),
  double progression through a rep range, or adding time for timed work. Or none at all.
- 🧾 **Every target explains itself.** "Every rep last time — 2.5 kg more." "Missed reps
  3 sessions running — reset to 55 kg and work back up." The rule is visible before you
  train, not after.
- The session opens with the right weights already in the rows, instead of suggesting them
  once you are standing at the bar.
- 🚫 **A bad session can't look like a good one.** Short reps count as a miss even when you
  checked the set off; a set you never checked counts as a miss because you did not do it.
  Nothing advances the load on a session that fell apart.
- Stalls and deloads are worked out from your log every time they are needed. Nothing is
  written back into a finished workout and no counters are stored, so fixing a mistyped set
  immediately produces the right next target.
- Lower-body lifts step up in larger jumps than upper-body ones by default, and any
  exercise can set its own step.
- Bodyweight exercises progress in **reps**, because there is no load to add to a push-up
  and no load to take off it either.

### Estimated 1RM (#18)

- 💪 **An estimated one-rep max for every lift**, in the exercise progress card (with its
  own curve you can switch to) and in the exercise detail sheet.
- It always names the set it came from — "from 90 kg × 5 on 15 Jul" — because an estimate
  off a heavy triple and one off a set of ten are very different claims.
- 🧮 **A calculator** for a set you have not done yet, so the number is reachable before
  there is any history.
- Epley by default, and it **refuses to guess above 12 reps**, where the common formulas
  disagree by double digits.
- A new best estimate is reported at the end of a workout separately from a weight PR —
  same weight for more reps is real progress, but it is not a heavier lift.

### Share a plan

- 📤 **Send someone your plan.** Plan → *Share your plan* writes a small file with your
  routines, the week schedule and any custom exercises they use — and nothing else. No
  workouts, no weigh-ins, no settings.
- Importing **merges**: shared routines arrive as new ones with fresh ids, custom exercises
  are matched by name so they are not duplicated, and your own plan is never overwritten.
  Taking the week schedule with it is optional.
- 🖨️ **A printable plan** (Save as PDF) laid out so a single exercise never breaks across
  a page.

### Fixes

- A shared plan file naming an exercise this build doesn't have can no longer take the app
  down. Unknown ids are dropped on import, anything that slips through renders as a
  placeholder you can delete, and an error boundary around the screens means a bad state is
  recoverable by switching tabs instead of reloading.
- Importing from another app converts weights **per row**, not per file. FitNotes writes the
  unit on each set, so a mixed export used to land 185 lb as 185 kg.
- Numbers follow the UI language instead of a hardcoded locale, which was putting Swiss
  apostrophes ("7'535 kg") in front of everyone. Volume stays in your own unit rather than
  switching to tonnes, which was wrong for pound profiles.
- Taking over a week schedule from a shared plan now really replaces Monday–Sunday instead
  of only the days the shared file happened to fill.
- The body-weight slider's ceiling follows your unit (300 kg / 660 lb).
- "Best: 85 Kg" is capitalised correctly again.

### One codebase, two flavors

openGym is also a standalone mobile app — and it ships as a direct APK download, not
through app stores.

- 📱 **Standalone mobile app.** The same frontend now also builds as a native iPhone /
  Android app (Capacitor) — the install-and-done flavor of openGym: no account, no server,
  no sync. Everything stays on the phone.
  - State is mirrored into a file in the app's private storage on every change, so your
    log survives even when the OS evicts WebView storage (iOS does).
  - The workout-day reminder becomes a **native notification** scheduled on the weekdays
    your plan actually has a routine — no push server involved.
  - Backups go out through the OS **share sheet** (Files, AirDrop, mail…).
  - Exercise images/animations load from the same CDN as the live demo.
  - `npm run build:mobile`, then open `android/` in Android Studio or `ios/` in Xcode —
    see **docs/MOBILE.md**. `NOTICE.md` now carries an AGPL §7 app-store exception.
- 🤖 **Android APK, no Play Store.** The official build is a signed, sideloadable APK
  (~4.5 MB) from [opengym.duarte-santos.ch](https://opengym.duarte-santos.ch) — deliberately
  store-free. docs/MOBILE.md covers building and signing your own.
- 🍎 **iOS reality check.** Apple permits no installs outside the App Store, so there is no
  iOS download; the docs explain the free options (self-hosted PWA on the home screen, or
  running the native app onto your own iPhone from Xcode).

- 📥 **Import your history from another app.** Settings → Data → *Import from another app*
  reads an export from **FitNotes** (both the Android and the FitNotes 2 iOS format),
  **Strong** and **Hevy**, and pulls body-weight history out of an **Apple Health** export.
  Anything else with a date, an exercise name and weight/reps columns is read too.
  - Every row becomes a set, grouped into workouts by date, so your history arrives with
    its real dates rather than as one lump. Hevy and Strong also carry session length, so
    the activity heatmap fills in properly.
  - Exercise names are matched against the 1,324-exercise library — parenthetical
    qualifiers like "(Barbell)" and shorthand like BB/DB are normalised, and a curated
    table covers the plain names people actually log ("Bench Press", "Squat", "RDL").
    Where a name is genuinely ambiguous it is *not* guessed at: it becomes one of your own
    exercises instead, because filing years of training under the wrong lift is worse than
    an unmatched name you can see and fix.
  - A summary shows what will happen — workouts, sets, how many exercises matched, which
    ones didn't, and whether weights need converting — before anything is written.
  - Importing is idempotent: days you already have data for are left alone, so running it
    twice, or importing from two apps, never duplicates a workout.

## v1.2.1 — 2026-07-23

A muscle map across the app, and a live demo you can try without installing anything.

- 💪 **Muscle map.** Three places now show which muscles your training actually reaches, drawn on a
  front-and-back body diagram shaded like the activity heatmap — more accent means more work.
  - **Stats → Muscle balance** aggregates a week, 30 days, 90 days or everything, lists your
    hardest-worked muscles with their set counts, and names the ones that got *nothing* in that
    period. That last list is the point of the card: the gaps are what you'd otherwise never notice.
    Tap any muscle to read its name and volume.
  - **Routine editor** previews what a session hits as you build it, so a hole in the plan shows up
    before you train around it for a month.
  - **The finish screen** shows what you just trained.
  - Load is counted in *effective sets* — a set counts fully for the exercise's target muscle and
    partially for its supporting ones — not in kilograms, because 100 kg of leg press and 12 kg of
    lateral raise say nothing about which muscle worked harder. Shading is relative within the
    period you're looking at, so the map always reads as a balance rather than an absolute.
  - Settings → Appearance → **Body diagram** switches between a male and female figure.
  - The exercise dataset spells muscles inconsistently ("delts", "deltoids" and "shoulders" are one
    muscle); all 50 spellings it uses are normalised onto the 18 the diagram can draw. Custom
    exercises, which only carry a body part, fall back to it. The geometry is ~90 kB and loads on
    demand, so the initial bundle is unchanged.
- 🐛 **Fixed: finishing a workout from its last exercise could blank the whole app.** The
  per-exercise weight sheet read the running workout without checking it was still there, and
  finishing clears it while that sheet is still on screen.
- ▶️ **Live demo** at [duartesantos8.github.io/openGym](https://duartesantos8.github.io/openGym/) —
  a browser-only build (`VITE_DEMO=1`) published to GitHub Pages on every push to `main`. It boots
  into guest mode with a seeded example profile (12 weeks of Push/Pull/Legs, weigh-ins, PRs) so
  every screen has something to show, and it never talks to a server. Passkeys, sync and the admin
  dashboard stay exclusive to self-hosted instances, which is where the backend lives.
- 🖼️ Builds can point the exercise media elsewhere via `VITE_IMG_BASE` / `VITE_GIF_BASE` — the demo
  serves the ~140 MB dataset from a CDN instead of shipping it. The default (`img/` and `gif/` next
  to the app) is unchanged.

## v1.2.0 — 2026-07-23

A complete visual redesign. Same app, same data — every screen redrawn.

### A designed interface, not an assembled one

- 🎨 **Rebuilt design system.** One type scale carrying hierarchy through size instead of making
  everything bold, a neutral surface ramp instead of saturated blue-greys, hairline separators
  instead of outlined boxes, and motion that acknowledges a press rather than animating for
  decoration. Light and dark are both first-class, and the eight accent colours now pick their
  label colour by measured contrast — the default green in light mode was failing WCAG AA on
  every primary button before.
- ✏️ **A hand-drawn icon set** (77 icons, single stroke weight, drawn on one 24×24 grid) replaces
  every emoji in the interface. Emoji render differently on each platform, sit on their own
  baseline and can't take a theme colour, which is what made the old UI feel stitched together.
  Icons inherit the surrounding text colour and optical size.
- 🏋️ **Routine icons.** Picking an icon for a routine now offers a grouped set — strength,
  equipment, cardio, recovery — instead of an emoji keyboard. Routines you already made keep
  their look: the old emoji are mapped forward automatically, so nothing to migrate and nothing
  to redo.
- ▶️ **New tab bar** with a raised Start button that turns into a pulsing orange Resume while a
  workout is running.
- 🏠 **Home reads as a plan for today** — week strip, today's session as one tappable row, body
  weight, and your streak.

### Charts

- 📈 **Axis labels, gridlines and the target-weight line are visible again** in dark mode. They
  were painted with colour variables that no longer existed, which silently fell back to black
  on black — and to no stroke at all for the lines.
- 💬 **The hover readout stays on screen.** It used to be positioned with a fixed offset that
  assumed one label width, so the first and last point pushed it under the chart's clip; it's now
  placed from its measured size and kept inside the frame, dropping below the point when the
  point sits high enough that the label would cover the value it reports.
- 🖱️ **It also goes away again** — moving off the chart now clears the readout, crosshair and
  marker, which previously stayed until you hovered somewhere else.

## v1.1.3 — 2026-07-22

Admin dashboard for self-hosters (opt-in — off by default), equipment filtering, and
workout-screen fixes.

### Admin dashboard

- 🛠️ **Admin dashboard** (Settings → Admin dashboard) for whoever runs the instance: a users
  overview with workout counts and last-active times, plus a per-user drill-down into their full
  workout history and body-weight log.
- 🟢 **Live "training now"** — see who's mid-workout in real time, with their current exercise and
  set progress, updated by a lightweight heartbeat while a workout is on screen.
- 🚫 **Disable / enable accounts** — a disabled account is signed out and locked out everywhere
  until you re-enable it.
- 🔑 **Invite-only signup** (optional) — require an invite code to create a profile; generate and
  revoke codes from the dashboard. Existing accounts are unaffected.
- ⚙️ Configured via environment: `ADMIN_UIDS` (comma-separated user ids who are admins) and
  `INVITE_ONLY=1`; both default off, so a fresh instance stays open with no admin. See
  `.env.example`. Admin access is gated by your passkey and enforced server-side.

### Exercises & workout

- 🏋️ **Filter exercises by equipment** (#6). A second filter row under the body parts lets you
  narrow the list to what you actually have — body weight, dumbbell, barbell, cable, band, and so
  on — in both the Exercises library and the exercise picker. The options adapt to what you've
  already selected and are ordered by how many exercises use them, so every combination on screen
  has results behind it and the row stays short. Building a bodyweight-only plan is now two taps
  per body part.
- 🔎 **Minimize the exercise animation during a workout** (#12). A ⤡ Minimize / ⤢ Expand button
  on the animation shrinks it to a thin strip so the set rows sit right under your thumb — no more
  scrolling past a big GIF to tick off a set. Your choice is remembered and applied to every
  exercise and future workout until you change it, so you set it once. Tapping the animation still
  pauses/plays it as before.
- ⏱️ **Fixed: the rest timer froze at 0:01** (#14) instead of counting down to the end. It also
  meant the timer could only be cleared with Skip, and a redundant "rest over" push notification
  could still fire.

## v1.1.2 — 2026-07-22

Custom exercises, full localization, and input fixes.

### Custom exercises (#11)

- ✨ **Create your own exercise** from the exercise picker or the Exercises tab: a name and a
  body part is all it takes. Your search text is pre-filled as the name, so "no match" flows
  straight into "create it".
- 📝 **Optional description** — setup, cues, anything you want to remember. It shows on the
  exercise's detail and config sheets (where a built-in exercise would show its animation),
  and it's searchable, so you can find your own exercises by their cues too.
- 🏋️ Custom exercises behave like built-in ones everywhere — routines, supersets, workout
  logging, weight suggestions, PRs, stats and history. The animation stays blank by design.
- 🏃 Pick the *cardio* body part and it logs time + speed instead of weight × reps, like the
  built-in cardio exercises.
- ✏️ Edit (rename, change body part or description) or delete your custom exercises — from
  their detail sheet in the Exercises tab, or straight from the exercise inside a routine via
  "Edit or delete this exercise". Deleting removes them from your routines; already-logged
  workouts keep their sets and still show the exercise name. (The routine sheet's old "Remove
  exercise" button is now labelled "Remove from routine", so the two are no longer confusable.)

### Localization (#7)

- 🌍 **12 UI languages**: English, Deutsch, Español, Français, Italiano, Português, Polski,
  Türkçe, Русский, 中文, 한국어, हिन्दी. Pick yours under Settings → Appearance → Language;
  the choice syncs with your profile like the theme does.
- 📖 **Localized exercise instructions** for 10 of those languages (all except German and
  Portuguese, which the upstream dataset doesn't cover yet — those fall back to English),
  covering all 1,324 exercises. Body-part filters, equipment and muscle tags are translated
  too; exercise *names* stay English (upstream limitation). Custom exercises are translated too.
- 📅 Dates, weekday and month labels follow the selected language.
- ⚡ Zero cost when unused: the app still ships English-only by default. Each UI language is a
  ~7 kB chunk and each instruction pack ~80–120 kB (gzipped), downloaded only when you switch —
  the initial bundle size is unchanged.
- 🛠️ New `scripts/build-instructions.mjs` regenerates the instruction packs from the upstream
  dataset; translations live in `frontend/src/locales/` (PRs welcome — it's one flat
  English-string → translation map per language).
- Known gaps: push notification texts (sent by the server) and plural forms in some languages
  are approximated; happy to take corrections from native speakers.

### Fixes

- ⌨️ Weight and other numeric fields now accept a comma as decimal separator ("33,5") — iOS
  decimal keyboards in many locales only offer a comma, which previously reset the field to 0.
  Partial input like "33," no longer snaps to 0 while typing. (#13)
- 📱 Fixed the exercise-config sheet (Sets / Reps / Weight, and the cardio variant) overflowing the
  screen edge on narrow phones — the Weight stepper was clipped and could make the whole page pan
  sideways in iOS Safari. Steppers now shrink to fit the viewport. (#10)
- 🛡️ Added a global horizontal-overflow guard so a single too-wide element can no longer knock the
  page layout off-scale.

## v1.1.1 — 2026-07-21

Reliability fixes for the push notifications shipped in v1.1.0, found through live testing:

- 🌍 Workout day reminder now fires by each user's own browser-detected timezone instead of a
  single server-wide one — works correctly regardless of where the server runs, and follows you
  automatically if you travel.
- 💾 Settings changes (like the reminder time) are flushed to the server immediately when the tab
  backgrounds or closes, instead of relying solely on a 1.5s debounce that could get cut short.
- ⏱️ Reminder check tightened from a 60s to a 10s interval, and pushes are now marked
  `urgency: 'high'` — cuts avoidable delay on top of it, though delivery time is ultimately up to
  Apple/Google's push relay.
- 🪵 Push send failures are now logged instead of silently swallowed.

## v1.1.0 — 2026-07-21

- 🐳 Prebuilt Docker images published to `ghcr.io/duartesantos8/opengym-{api,web}` (amd64 + arm64)
  via GitHub Actions, so self-hosting no longer requires building from source. `docker compose pull`
  grabs them; `docker compose up -d --build` still builds locally if you'd rather.
- 🔔 Push notifications: rest-timer-over alert (fires even if the app is closed) and an optional
  daily reminder on days you have a workout planned but haven't logged one yet. Opt in per-profile
  in Settings — requires a signed-in passkey profile. Backend gains one dependency (`web-push`);
  VAPID keys are generated on first run.
- 🐛 Fixed the rest timer stalling when the tab/app is backgrounded — it's now anchored to a real
  timestamp instead of a plain per-second counter, so it stays accurate after you come back.

## v1.0.0 — 2026-07-20

First public release. A complete, self-hostable gym & body-weight tracker.

**Highlights**
- ⚖️ Body-weight tracking with an interactive chart + goal line
- 🏋️ Weekly routine planner over 1,324 exercises with animated demos
- ▶️ Guided workouts: body-weight check-in, pre-filled weights, rest timer, PR detection, per-exercise weight tracking
- 🔗 Supersets and 🏃 cardio (time + speed) logging
- 🗓️ Per-day rescheduling without touching your weekly plan
- 🟩 GitHub-style activity heatmap (by time trained)
- 🔑 Passkey (WebAuthn) login with per-profile data that syncs across devices
- 🎨 Light/dark themes + 8 accent colors, synced to your profile
- 📦 JSON export/import, guest mode, PWA install, no telemetry

**Stack**
- React 19 + Vite (React Router, Zustand)
- Node backend, no framework, single dependency (`@simplewebauthn/server`), JSON-file storage
- nginx + multi-stage Docker so `docker compose up` builds and serves everything

**Notes**
- Exercise media (~140 MB) is fetched from [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) on first run.
- Licensed under GNU AGPL v3.0.
