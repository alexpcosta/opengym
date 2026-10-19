# Trainer mode and the food diary

This fork turns the instance's admins into **trainers**. A trainer writes each student's
training plan, diet and supplement list, sees every workout, every logged meal and every dose
ticked off, and gets a notification when something worth knowing happens. Students get a food diary in the style of MyFitnessPal:
calories and macros against targets calculated from their goal, searched from a food table in
Portuguese and Spanish, or read off a barcode.

Nothing here needs configuring. Trainer mode is there for whoever is listed in `ADMIN_UIDS`
(or flagged admin), and the diary is there for every signed-in profile.

## Who is a student

Every profile that is not an admin is a student of every admin. There is no linking step and no
invitation: one trainer, or a small team, running one instance. Disabled accounts drop out.

You are on the list too, first, as **You**: the same page writes your own training plan and diet
(menu, alternatives and all). It works like a student's, minus the notifications — nothing is
pushed to you about your own plan.

## Training plans

Settings → **Students** (or the card on Home) → pick a student → **Training**.

- **Write the plan.** Build the week and the routines with the same editor as your own plan,
  or tap **Copy from my plan** and adjust. Nothing reaches the student until you tap **Send**.
- **Delivery.** The student's app picks the plan up the next time it opens or comes back to the
  foreground, and shows "Your trainer updated your plan". You see when it arrived ("Version 3 is
  on Ana's phone").
- **Locked for the student.** The trainer's routines and the week are read-only on their side.
  They can still train anything, move a single day (sick, travelling), and keep routines of their
  own next to yours. The AI Coach steps aside while a trainer plan is active.
- **History survives edits.** Routine ids do not change between versions, so progression and
  history stay attached when you change sets, reps or exercises.
- **Remove plan** gives the student their plan back. Their workout history stays.

## Diets

Same student page → **Diet**.

- **Targets.** The calculator starts from the student's own data (sex, date of birth, height,
  weight, activity, goal, pace) and shows where each number comes from:
  - basal rate by Mifflin–St Jeor × activity factor = maintenance;
  - ± a deficit or surplus from the weekly pace, capped at −25 % / +15 % and never below the basal
    rate or 1200 kcal;
  - protein by body weight for the goal (2.0 / 1.6 / 1.8 g/kg), fat at 25 % of calories (at least
    0.6 g/kg), carbohydrate the rest.

  Change any input — the student's profile is not touched — or tap **Adjust** and type your own.
- **Menu (optional).** Meals with foods and grams, and up to five **alternatives** per food
  ("or 100 g of cassava"). Targets alone also work: the student logs whatever they eat.
- **On the student's phone.** The trainer's targets replace theirs, the menu's meals become the
  diary's meals, and each planned food has a ✓ to log it as written, or a tap to pick an
  alternative and the amount. **Ate as planned** logs a whole meal at once.
- **Copy from another student** starts a diet from one you already wrote.
- **Food diary — last 14 days** shows each day against the targets; tap a day for what was eaten,
  meal by meal.
- **Trainer foods** (the flame button on the Students screen): foods you add with their values
  per 100 g appear for every student under "From your trainer" — local dishes, a supplement, the
  gym's shake.

## Supplements

Same student page → **Supps**.

A short list, by design: each entry is a **name**, an **amount in your own words** ("5 g",
"2 cápsulas", "1 scoop"), the **days** it is taken on and **how many times** a day — optionally
with a clock time per dose, and a note ("with water, after training"). Up to 40 entries, up to
six doses a day each.

There is no route, no mg/ml field and no cycle: this is the adherence list you and the student
tick off together. Anything a doctor prescribed belongs with their doctor, and the student's
screen says so.

- **On the student's phone.** A **Supplements** screen (from Home, and from the row under the
  diary) lists what is due today with one tick per dose, the two weeks behind it as coloured
  squares, and **Tick everything for this day** when a day went as written. Earlier days can be
  filled in — nothing is ever "too late".
- **A dose is a slot, not a clock time.** Ticking "the second one" means the same thing after you
  move 20:00 to 21:00, so changing the times never erases what was already marked, and a student
  in another time zone is never late.
- **Last 14 days** on your side: each day is all ticked, partly ticked, not ticked, or had
  nothing due. Tap a day to see which dose was missed.
- **Copy from another student** starts a list from one you already wrote (with fresh ids — two
  students never share one prescription).
- **Remove the list** takes it off their phone. What they already ticked stays.
- A list that falls on Monday to Friday is never "missed" on a Sunday, and days with nothing due
  are not counted against anyone.

## Notifications

The bell on the Students screen. Each kind can be switched off. Everything also lands in the
**Latest** feed, push or not.

| Event | When |
|---|---|
| Workout finished | The student's phone syncs a workout that ended in the last 6 hours. History imports and a phone's first sync never flood you: older workouts are ignored and one sync sends at most three. |
| New record (PR) | Same moment, as its own notification. |
| Planned workout skipped | At the check time (default 21:00), if the day had a planned routine and nothing was logged. |
| No food logged | At the diary check time (default 22:00), for students who have targets. |
| Day off target | Same time: calories more than 15 % off the target, or protein under 90 % of it. |
| Nothing ticked | At the dose check time (default 21:30), when doses were due that day and none were marked. |
| Dose missed | Same time: some doses marked and some not, with the supplements still outstanding named. |
| Daily summary | At the summary time (default 22:30) on *your* clock: "6 students: 4 on target · 1 off · 1 not logged". |

The workout, diary and dose checks run on **each student's own clock** — their app reports its time
zone every time it opens. Push needs notifications switched on in Settings on the device you
want them on. Tapping one opens the student's page.

## The food diary (students)

The **Diet** tab replaces Exercises in the tab bar; the exercise library is one tap away from the
Plan header and from every exercise picker. It needs the server, so guests, the standalone
Android app and the demo keep the old tab bar.

- **First run.** "Your data" asks for sex, date of birth, height, weight, activity, goal and pace,
  then shows the calculated targets with the reasoning. Calculated targets follow the body weight
  as it changes; **Adjust** fixes them by hand instead.
- **Logging.** Each meal has **Add food**:
  - **Recent** — the foods you eat most, with last time's amount;
  - **search** — the bundled TACO table answers as you type, offline;
    **Search packaged foods** asks Open Food Facts;
  - **Barcode** — the camera, or type the number;
  - **Quick add** — calories and macros only;
  - **New food** — from a label, per 100 g, with a serving size if you like.
- **Amounts** in grams or in the food's own serving ("1 cebada (25 g)"), with the macros worked
  out live.
- **Copy the previous day** for days that repeat.

## Food data

- **TACO** — Tabela Brasileira de Composição de Alimentos, 4ª ed. (NEPA/UNICAMP, 2011), 593 foods
  per 100 g, bundled with the app (`frontend/src/food/taco.json`, ~50 KB, loaded only when the
  diary is used). Portuguese names are the table's own; the Spanish names
  (`frontend/scripts/taco/taco-es.txt`) use the terms of Paraguay and the River Plate ("papa",
  "poroto", "zapallo", "mburucuyá"). Regenerate with `node scripts/build-taco.mjs`; CI runs it
  with `--check`. `scripts/extract-taco.py` documents how the numbers were taken from the
  official PDF.
- **Open Food Facts** — packaged products and barcodes, ODbL. Always through this server:
  Open Food Facts allows about 10 searches and 15 product reads a minute **per IP**, and every
  student shares the server's IP. A token bucket keeps under the limit, a cache
  (`data/food/cache.json`) answers repeats for 7 days (30 for products), and online search runs
  only when someone asks for it. Set `OFF_CONTACT` in `.env` to an e-mail so Open Food Facts
  can reach you; it goes in the User-Agent they require.
- **Barcode scanning** uses the browser's `BarcodeDetector` where there is one (Chrome on
  Android) and the `barcode-detector` / zxing-wasm ponyfill elsewhere (iPhone). Both load only
  when the scanner opens, and the ~1 MB `.wasm` is served by this app, never from a CDN. The
  camera needs HTTPS.

## Where it is stored

All under `./data`, so backing up `./data` still backs up everything:

| Path | What |
|---|---|
| `trainer/plans/<uid>.json` | The trainer's plan for a student, versioned |
| `trainer/diets/<uid>.json` | The trainer's diet for a student, versioned |
| `trainer/supps/<uid>.json` | The trainer's supplement list for a student, versioned |
| `trainer/foods.json` | Trainer foods |
| `trainer/events.json` | The feed (last 1000 events) |
| `trainer/state.json`, `trainer/settings.json` | Once-a-day markers; check times |
| `diet/<uid>/<YYYY-MM>.json` | Each student's food diary, by month |
| `supp/<uid>/<YYYY-MM>.json` | Each student's ticked doses, by month |
| `food/cache.json` | Open Food Facts answers |

Plans and diets live outside the students' state files on purpose. A device PUTs its whole state
and the newest copy wins, so anything the server wrote in there would be erased by the next
phone to sync. Plans and diets are pulled and applied on the device instead, like the Coach's
proposals, and a phone that synced a stale copy reapplies the current version on its next launch.
The diary and the ticked doses are kept per day for the same reason, and because a year of meals
is bigger than everything else in a profile together — and because the daily checks have to read
them on the server.
