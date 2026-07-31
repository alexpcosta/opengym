# openGym × CLI AI — functional plan

**Feature:** AI-assisted plan creation and feedback-driven plan recalculation, via a locally-run CLI agent
**Status:** Draft for review — functional description first; the technical plan follows once this is agreed
**Baseline reviewed:** v1.2.3 (2026-07-31)
**Working name used below:** *the Coach*

---

## Table of contents

1. [Summary](#1-summary)
2. [Principles](#2-principles)
3. [The solution today — reviewed](#3-the-solution-today--reviewed)
4. [Decisions already taken](#4-decisions-already-taken)
5. [Scope](#5-scope)
6. [Personas](#6-personas)
7. [Feature overview](#7-feature-overview)
8. [User stories & acceptance criteria](#8-user-stories--acceptance-criteria)
9. [User journeys](#9-user-journeys)
10. [Functional requirements](#10-functional-requirements)
11. [Non-functional requirements](#11-non-functional-requirements)
12. [New & changed surfaces](#12-new--changed-surfaces)
13. [Data additions (functional sketch)](#13-data-additions-functional-sketch)
14. [Suggested delivery phasing](#14-suggested-delivery-phasing)
15. [Explicitly out of scope (for now)](#15-explicitly-out-of-scope-for-now)
16. [Open questions for the technical plan](#16-open-questions-for-the-technical-plan)
17. [Glossary](#17-glossary)

---

## 1. Summary

openGym today takes a lifter from "I joined a gym" to "I logged my 100th session": a manual plan builder over a 1,324-exercise library, one starter plan (Push/Pull/Legs), guided workouts that pre-fill targets, and a deterministic progression engine that adjusts loads with a visible *why*. What it cannot do is **design**. It will faithfully progress whatever plan you gave it, but it has no opinion on whether that plan fits your goal, schedule, equipment or the feedback you have been logging for weeks — the per-set effort ratings (RIR/RPE) are, by the app's own admission, read by nothing.

This change adds an **AI Coach**, powered by a **CLI agent running locally on the instance owner's machine** (Claude Code CLI, Gemini CLI or OpenAI Codex CLI — pluggable), with two jobs:

1. **Create a plan.** A short guided intake (goal, experience, availability, session length, equipment, limitations, plus free text) produces a complete proposed weekly plan: routines, exercise selection, sets × reps/time, supersets, week schedule, and progression policies with increments. The user refines it in plain language ("no lunges, Mondays are short") and accepts it.
2. **Recalculate the plan from training feedback.** On demand and/or on a cadence, the Coach reads what actually happened — sets hit or missed vs. their targets, effort trends, stalls and deloads the engine fired, adherence and reschedules, body-weight trend vs. goal — and proposes **discrete, explained changes** that the user reviews and approves individually. Nothing is ever applied silently.

The Coach designs and adjusts the *plan*; the existing progression engine keeps computing day-to-day loads. The division of labour is deliberate: plans are where judgement lives, targets are where math lives, and the math stays auditable and offline-capable.

---

## 2. Principles

These extend the values already in the codebase and README, and every requirement below traces back to one of them.

| # | Principle | Consequence |
|---|-----------|-------------|
| P1 | **Your box, your data.** | The AI agent runs as a CLI on the self-hosted instance, configured by its owner. openGym itself gains no cloud dependency and no bundled API keys. |
| P2 | **A suggestion you can't audit is one you stop trusting.** (verbatim from `progression.js`) | Every Coach proposal is a list of discrete changes, each with a rationale tied to the user's own data. Every applied change is logged and reversible. |
| P3 | **Opt-in, twice.** | The instance owner must enable AI; each profile must additionally consent after seeing exactly what data leaves the server. Default is off at both levels. |
| P4 | **The engine keeps the math.** | Session-to-session weight/rep targets stay with the deterministic progression engine (`linear`, `greyskull`, `double`, `time`). The Coach configures the plan and the policies, not tomorrow's bar weight. |
| P5 | **No lock-in, provider-agnostic.** | Any of the three mainstream CLI agents (or a custom command honouring the same contract) can drive the Coach. Switching providers changes nothing for users. |
| P6 | **Degrade gracefully.** | AI off, CLI broken, or job timed out — the app behaves exactly like today. Workouts, sync and progression never wait on an AI call. |
| P7 | **Nothing applied without approval.** | Proposals are inert until the user accepts them (whole or per change). Accepting snapshots the previous plan for one-tap revert. |

---

## 3. The solution today — reviewed

This section is the inventory the new features build on. It was compiled from the actual code (`frontend/src/views/*`, `frontend/src/lib/*`, `frontend/src/store/useStore.js`, `api/server.js`).

### 3.1 Current personas

| Persona | Build | Data lives | Notes |
|---|---|---|---|
| **Instance owner / admin** | self-hosted | `./data` on their host | Configures `.env` (`RP_ID`, `ADMIN_UIDS`, `INVITE_ONLY`…), runs `docker compose up`, gets an admin dashboard (users, live "training now", invites, disable accounts). |
| **Profile user ("the lifter")** | self-hosted | server, synced across devices | Passkey sign-in; state blob per user (`state-<uid>.json`), pushed/pulled whole with last-write-wins on `_ts`. |
| **Guest** | self-hosted | browser localStorage only | Same features minus sync; can upgrade to a profile later (local data moves in). |
| **Demo visitor** | GitHub Pages build | browser, seeded example data | No backend at all. |
| **Mobile standalone user** | Capacitor APK | on-phone file mirror | No backend, no accounts, native reminders. |

### 3.2 Current journeys (condensed)

- **Onboarding** — create passkey profile (optionally with invite code) or continue as guest → empty Home shows a *Welcome!* card: **Load starter plan (PPL)** or **Build my own plan**.
- **Plan building** (`/plan`, `/plan/r/:id`) — create routines (name, icon), pick exercises from the library (search, body-part & equipment filters, custom exercises), configure each: `sets`, mode `reps|time|cardio`, `reps`/`sec`/`min`+`speed`, baseline `weight`, per-exercise or per-routine **progression policy** (`off|linear|greyskull|double|time`) with `inc` step and `repsMin` rep-range floor, reorder, link **supersets** (`sg`). A live **muscle map** shows what the routine hits.
- **Scheduling** — assign one routine per weekday (`S.week`), and **reschedule any single date** (`S.dayPlan[iso] = routineId | 'rest'`) from Home, the calendar, or the workout screen.
- **Running a workout** — start today's session (body-weight check-in gate first), the app builds per-exercise sets seeded from last time / per-exercise top weights (`S.exWeights`), then applies the engine's **prescription with a human-readable *why*** ("Every rep last time — 2.5 kg more."). The lifter logs per set: weight × reps (plus optional **RIR or RPE** effort), or held seconds (timed), or minutes @ speed (cardio); rest timer, work timer, PR detection, top-weight confirmation, finish summary with muscle map.
- **Reviewing** — Stats (activity heatmap by minutes, muscle balance with "not trained" gaps, per-exercise progress curves, estimated 1RM), History (list + per-workout detail; delete only — finished workouts are never edited).
- **Sharing & data ownership** — export/import a **plan file** (`opengym_plan` v1: routines + week + referenced custom exercises; import *merges*, never overwrites), print to PDF, full JSON backup export/import, importers from FitNotes/Strong/Hevy/Apple Health.
- **Notifications** — Web Push (VAPID, keys auto-generated): rest-timer alerts and an opt-in "workout planned today" reminder at a chosen local time.
- **Admin** — users overview, live training presence, invite codes, disable accounts, per-user history drill-down.

### 3.3 Current user stories (inventory)

Already supported today (abridged to the ones the Coach builds on):

- As a lifter, I can build routines and assign them to weekdays, so my week has structure.
- As a lifter with no plan, I can load a starter plan (PPL) so I can train today.
- As a lifter, I can pick a progression rule per routine or per exercise, and the app tells me *why* each session's target is what it is.
- As a lifter, I can log every set (weight, reps, time, effort as RIR/RPE) with minimal taps mid-workout.
- As a lifter, I can reschedule a single day without touching my weekly plan.
- As a lifter, I can see what my training actually hit (muscle balance, gaps, PRs, 1RM trend, streaks).
- As a lifter, I can export my plan for a friend and import theirs without losing mine.
- As a lifter, I own my data: full JSON export, no telemetry, self-hosted.
- As an instance owner, I control sign-ups, see who's training, and can disable accounts.

### 3.4 The feedback the app already collects (input for recalculation)

Every signal below already exists in the state — **no new tracking is required** for the Coach's core loop:

| Signal | Where it lives | Today it's used for |
|---|---|---|
| Per-set results vs. prescribed target | `workouts[].entries[].sets` + `entries[].target` | Progression engine hit/miss (`readSession`) |
| Effort per set (RIR 0–10 / RPE 6–10, half steps) | `sets[].rir` / `sets[].rpe` | **Display only — read by nothing** |
| Stalls & deloads | derived (`stallCount`, `nextPrescription`) | Engine's hold/deload decisions |
| Adherence: planned vs. trained days, reschedules, rest overrides | `week`, `dayPlan`, `workouts[].d` | Heatmap, streak, reminder suppression |
| Session duration & volume | `workouts[].start/end`, `vol` | Stats tiles, heatmap shading |
| PRs and estimated 1RM | `workouts[].prs`, derived e1RM | Badges, progress curves |
| Body weight vs. goal | `bodyweight[]`, `targetW` | Chart, delta colouring |
| Muscle balance & untrained muscles | derived from sets | Stats body map |
| Per-exercise working weights | `exWeights` | Pre-filling sets |

### 3.5 Gaps the Coach addresses

1. **Plan design requires expertise.** The builder is excellent *mechanics*, but choosing exercises, volume, split and policies is on the user. One starter plan fits few.
2. **The plan never learns.** The engine adapts *loads* within a fixed plan; nothing ever adjusts the plan itself (volume, exercise selection, schedule) from results.
3. **Logged effort is wasted.** RIR/RPE is collected and explicitly unused. It is exactly the signal a coach needs.
4. **Feedback exists but has no reader.** Adherence, stalls, body-weight trend and muscle gaps are all displayed to the user, but nothing synthesises them into "here is what to change".

---

## 4. Decisions already taken

Agreed with the project owner on 2026-07-31 (options were presented and selected explicitly):

| # | Question | Decision | Consequence |
|---|---|---|---|
| D1 | AI vs. progression engine | **AI coaches, engine computes.** | The Coach designs/adjusts routines, exercise selection, sets × reps, schedule, and which progression policy + increments apply. Day-to-day load math stays with the deterministic engine. The Coach may set starting baselines only for exercises it newly adds. |
| D2 | Plan-creation interaction | **Guided intake + free text, with iteration.** | Structured wizard (goal, experience, days/week, session length, equipment, limitations) plus a free-text box; after the proposal, the user refines with follow-up text before accepting. |
| D3 | Recalculation trigger | **On demand + optional periodic.** | A "Coach review" action available anytime, plus an opt-in cadence (weekly or every N completed workouts) that prepares a proposal and notifies. |
| D4 | Applying changes | **Review diff, approve.** | Proposals are per-change lists (each with rationale); the user accepts all or individual changes in a before/after view. Nothing changes without approval. |

---

## 5. Scope

### In scope

- **Self-hosted instances only** — the CLI agent runs on the machine (or container host) that runs openGym; the instance owner installs and authenticates the CLI of their choice.
- **Signed-in profiles only (v1).** Coach jobs run server-side against the profile's synced state; consent, history and proposals are tied to a profile.
- Both Coach capabilities: **plan creation** and **feedback-driven recalculation**, including the refinement loop, per-change approval, revert, coach log, notifications, per-profile settings, and admin configuration/status.
- **Provider adapters** for Claude Code CLI, Gemini CLI, OpenAI Codex CLI (the "GPT CLI"), plus a custom-command escape hatch.
- Full **i18n** of the new UI (12 languages) and Coach output in the profile's language.

### Out of scope (v1)

- **Demo build** (GitHub Pages) — no backend, no CLI. (A canned, pre-baked example proposal for the demo is a nice-to-have; see §15.)
- **Standalone mobile app** — no server to run a CLI. Entry points are hidden in the `MOBILE` build.
- **Guest mode** — a guest's data deliberately never leaves the browser today; shipping their history to a server-side CLI would break that promise. Guests see a hint that the Coach needs a profile. (Revisit later — see §16.)
- AI prescribing per-session loads, AI chat during a workout, nutrition, form analysis (see §15).

---

## 6. Personas

Updated for this feature; all current personas remain valid.

- **The instance owner** — installs *and pays for* the CLI agent (their subscription/API account), decides whether the instance offers the Coach at all, caps usage, monitors health. Trusts openGym not to surprise their users.
- **The self-coached lifter** — trains consistently, logs honestly, has goals but not programming expertise. Wants "someone" to look at the numbers and adjust the plan — without handing their training history to a SaaS.
- **The beginner** — installed openGym (or was invited to a family instance), owns two dumbbells and a bench, doesn't know where to start. The starter PPL is close but not right.
- **The skeptic / non-AI user** — chose openGym *because* it has no cloud AI nonsense. Must lose nothing: with AI unconfigured or consent declined, the app is pixel-identical to today.

---

## 7. Feature overview

| ID | Feature | One-liner | Decision |
|----|---------|-----------|----------|
| F1 | **Instance AI configuration** | Owner selects/enables a CLI provider; status & health surfaced in the admin dashboard. | P1, P5 |
| F2 | **Per-profile consent & Coach settings** | Opt-in consent with a plain-language data disclosure; intake profile; cadence; off switch. | P3 |
| F3 | **Coach plan creation** | Guided intake + free text → complete proposed plan (routines, schedule, policies) with rationale. | D2 |
| F4 | **Refinement loop** | Free-text follow-ups revise the pending proposal before accepting. | D2 |
| F5 | **Coach review (recalculation)** | On-demand analysis of training feedback since the last review → per-change proposal. | D1, D3 |
| F6 | **Periodic review** | Opt-in weekly / every-N-workouts review; push notification when a proposal is ready. | D3 |
| F7 | **Proposal review & apply** | Per-change accept/reject with before/after, muscle-map preview, plan snapshot + revert. | D4, P7 |
| F8 | **Coach log & auditability** | Every job, payload summary, proposal and decision recorded per profile; exported with backups. | P2 |
| F9 | **Session feedback capture (light)** | Optional one-tap session rating (+ note) on the finish summary, enriching future reviews. | *Should* |

---

## 8. User stories & acceptance criteria

Story IDs are stable for the technical plan to reference. Priorities: **[M]**ust, **[S]**hould, **[C]**ould.

### Epic A — Enable the Coach (instance owner)

**A1 [M] Configure a provider.**
*As an instance owner, I can enable the Coach by configuring which locally-installed CLI agent to use, so my users get AI features without any of them needing accounts or API keys.*
- Configuration lives at instance level (`.env`, consistent with `ADMIN_UIDS` / `INVITE_ONLY`), selecting one of: `claude` (Claude Code CLI), `gemini` (Gemini CLI), `codex` (OpenAI Codex CLI), or a custom command implementing the same contract.
- Default is **unset/off**: no AI UI appears anywhere, no new behaviour.
- The CLI's own authentication is the owner's responsibility (their subscription or API account); openGym never asks users for keys.

**A2 [M] See status & test.**
*As an admin, I can see in the admin dashboard whether the Coach is configured, reachable and authenticated, and run a test invocation.*
- Status card: provider name, CLI available yes/no, last successful job, last error (message + time).
- "Test the Coach" runs a trivial round-trip and reports pass/fail with the failure reason.

**A3 [S] Cap usage.**
*As an instance owner, I can cap Coach jobs per profile per day, so costs stay predictable on a shared instance.*
- Default cap applies (suggested: 10/day/profile); hitting it returns a friendly "the Coach is resting — try tomorrow" with the admin-set limit visible.

**A4 [M] Privacy boundary for admins.**
*As a lifter on a shared instance, the admin can enable/disable the feature but cannot trigger a Coach run on my data or read my proposals.*
- Admin surfaces show only job counts/failures per user (consistent with what admins already see), never intake answers, payloads or proposal contents.

### Epic B — Create a plan with the Coach (lifter)

**B1 [M] First plan from intake.**
*As a new user with no routines, I can choose "Let the Coach build my plan" on the first-run card, answer a short intake, and receive a complete proposed weekly plan.*
- Intake (one screen per topic, skippable where sensible): **goal** (strength / muscle / general fitness / fat loss / endurance), **experience** (new / returning / regular), **days per week + preferred weekdays**, **session length**, **equipment** (multi-select over the library's equipment taxonomy, incl. "just body weight"), **limitations/injuries** (free text), **likes/dislikes** (free text), **anything else** (free text).
- The proposal contains: 1–7 routines (name, icon), exercises in order with `sets` × `reps`/`sec` (and supersets where sensible), a week assignment honouring the chosen days, a progression policy per routine (and per-exercise overrides incl. `inc` / `repsMin` where warranted), and a **short rationale per routine and per exercise**.
- Every exercise resolves to a real library id (or an explicitly-proposed custom exercise — see FR-C7). Invalid ids cannot reach the user (same guarantee as plan-file import).
- Nothing is written to my plan until I accept (Epic D stories).

**B2 [M] Right level for returning users.**
*As a user with logged history, the Coach starts me at the right level.*
- For exercises I've done, proposed baselines reference my logged bests / recent working weights conservatively; for new exercises the plan carries no invented load — the engine's existing "first session sets the baseline" behaviour applies.
- The proposal says which history it used ("based on your last 12 weeks").

**B3 [M] Refine before accepting.**
*As a user reviewing a proposed plan, I can ask for changes in plain language and get a revised proposal.*
- Free-text box on the proposal screen ("no barbell on Thursdays", "I hate lunges"); the revision replaces the pending proposal and notes what changed vs. the previous iteration.
- Iterations are cheap to request, capped per day by A3.

**B4 [M] Accept = plan import semantics.**
*As a user, accepting a created plan adds it exactly like importing a plan file: routines are added as new (fresh ids), and I choose whether its week schedule replaces mine.*
- Existing routines/history are never modified by plan creation; the "Use this weekly schedule" switch mirrors today's plan-import sheet.

**B5 [M] Walk away.**
*As a user, I can discard a pending proposal or abandon intake at any point with no side effects.*

**B6 [S] See what it hits.**
*As a user, the proposal preview shows the existing muscle map per routine and for the week, so I can see balance before accepting.*

### Epic C — Coach review: recalculation from feedback (lifter)

**C1 [M] On-demand review.**
*As a user, I can request a Coach review at any time, optionally with a note ("shoulder pinches on bench", "gym is packed Mondays", "only 3 days next month").*

**C2 [M] The review reads my actual training.**
- Inputs (all existing data, see §3.4): sessions since the last review (or last 8–12 weeks, whichever is smaller): per-set hits/misses vs. `target`, effort values and trend where logged, engine stalls/deloads/holds per exercise, adherence (planned vs. trained days, reschedules, rest overrides, streak), session durations vs. intake session length, PRs and e1RM trend, body-weight trend vs. `targetW`, muscle-balance gaps ("not trained in this period").
- The proposal header states its evidence window: "Based on your last 9 sessions (4 weeks)."

**C3 [M] Discrete, explained changes.**
*As a user, the review result is a list of individual changes, each with a rationale tied to my data.*
- Allowed change types (closed list — anything else is invalid): add/remove/swap exercise; change `sets`, `reps`, `repsMin`, `sec`, `min`/`speed`; reorder exercises; link/unlink supersets; change routine or exercise progression policy, `inc`; add/remove/rename a routine; change week assignments (`week`); set the starting baseline of a **newly added** exercise only.
- Each change carries: target (routine/exercise/weekday), before → after, a one-to-three-sentence *why* naming the evidence ("Bench pressed at RPE ≥ 9.5 for three sessions and stalled twice — swapping in dumbbell press at 3×10 for four weeks").
- Advice-only items (no data change — e.g. "sleep more", "consider logging effort") appear in a separate "notes from the Coach" section and have no apply action.

**C4 [M] Boundaries.**
*As a user, the Coach never touches what happened or what isn't the plan.*
- Never edits: workout history, weigh-ins, `exWeights`, settings (unit, language, effort scale…), custom-exercise definitions it didn't propose, other profiles, `dayPlan` date overrides.
- Never prescribes next-session loads for existing exercises (D1); the engine remains the only writer of session targets.

**C5 [M] Nothing new, no noise.**
*If my training gives the Coach no reason to change anything, the review says so* ("Plan's working — hold the course", with a short read on why) *and produces no notification and no pending proposal.*

**C6 [S] Effort finally matters.**
*As a user who logs RIR/RPE, the Coach uses it and says so; as a user who doesn't, the Coach may (once) suggest enabling it.*
- The RIR↔RPE equivalence follows the app's own table (RPE ≈ 10 − RIR); sets keep the scale they were logged in.

**C7 [S] Session feedback capture (F9).**
*As a user finishing a workout, I can optionally rate the session (too easy / about right / brutal) and leave a short note; the Coach reads both.*
- One extra tap max on the finish summary; skippable forever; stored on the workout entry.

### Epic D — Trust, control, transparency (lifter)

**D1 [M] Informed consent.**
*As a user on an AI-enabled instance, the Coach does nothing until I opt in on a consent screen that shows exactly which data categories leave the server, that they go to the configured provider's model under the instance owner's account, and that I can revoke anytime.*
- Declining or ignoring keeps the app identical to today (entry points show as a single dismissible "Meet the Coach" card until dismissed).
- Consent version is recorded; a material change to what's shared re-prompts.
- The screen carries the health disclaimer: the Coach is not medical advice.

**D2 [M] Review & apply, granularly.**
*As a user, I review a proposal as a before/after diff and accept all changes or hand-pick; rejected changes are dropped.*
- Accepted changes apply atomically together; the previous plan (routines + week) is snapshotted first.

**D3 [M] One-tap revert.**
*As a user, I can revert the last applied Coach change-set, restoring the snapshot* (workouts logged in between are untouched — reverting a plan never edits history).

**D4 [M] Coach log.**
*As a user, I can see every Coach job: when, trigger (manual/scheduled/intake), provider, data-window summary, outcome (proposal/no-change/failed), and what I decided; applied changes remain inspectable with before/after.*
- The log is part of my state: included in JSON backup export, restored on import, synced across my devices.

**D5 [M] Off switch.**
*As a user, I can turn the Coach off for my profile; pending proposals are discarded, scheduled reviews stop, my log remains.*

**D6 [M] Injury memory.**
*As a user, limitations I stated in intake (or later edits) persist and are respected by every subsequent proposal; pain mentioned in free text makes the Coach conservative and suggests professional advice rather than programming around it.*

### Epic E — Periodic reviews & notifications

**E1 [M] Cadence.**
*As a user, I can enable automatic reviews: off (default) / weekly / after every N completed workouts (N configurable, suggested 3–6).*

**E2 [M] Notify only when there's something to say.**
*When a scheduled review produces a proposal, I get a push notification ("Your Coach has 4 suggestions after this week") through the existing opt-in push channel; "no changes" reviews notify nothing.*
- Users without push still see the pending proposal surfaced on Home.

**E3 [M] One pending proposal.**
*At most one pending proposal exists per profile; a newer review supersedes it (the superseded one goes to the log).*

**E4 [S] Quiet failure.**
*A failed scheduled review never notifies me; it's visible in my Coach log and the admin's status card, and the next cadence tick retries.*

### Epic F — Everyone else is unaffected

**F1 [M] Invisible when unconfigured.** Instance without a provider: zero UI additions, zero payload/state changes, zero new network behaviour.
**F2 [M] Hidden where impossible.** Demo build, mobile standalone build and guests: Coach entry points hidden (guests see the profile hint, B5-style dismissible).
**F3 [M] Never in the way.** Coach jobs are asynchronous; starting/finishing workouts, logging, sync and the progression engine never block on, or change behaviour because of, an AI call in flight.

---

## 9. User journeys

### J1 — Instance owner enables the Coach
1. Owner installs their preferred CLI on the host (e.g. `npm i -g @anthropic-ai/claude-code`), authenticates it with their own account, and verifies it runs headless.
2. Sets the provider in `.env` (e.g. `AI_PROVIDER=claude`), restarts compose.
3. Opens **Settings → Admin dashboard**: new *Coach* card shows "claude · CLI found · authenticated". Runs **Test the Coach** → green.
4. From now on, profiles on this instance see the "Meet the Coach" card. The owner's own docs duty: tell their users whose account pays for it (the consent screen states the provider).

### J2 — New user: first plan with the Coach
1. Maria creates a profile on her partner's instance. Home shows the *Welcome!* card, now with three options: **Load starter plan** · **Build my own plan** · **Let the Coach build it**.
2. She picks the Coach → consent screen (what's shared, where it goes, not medical advice) → agrees.
3. Intake: goal *muscle*, experience *returning*, 3 days (Mon/Wed/Fri), 45 min, equipment *dumbbells + bench + pull-up bar*, limitation "noisy downstairs neighbours — no jumping", free text "I want visible arms progress".
4. "The Coach is thinking…" (async status, she can leave the screen; a banner on Home tracks it).
5. Proposal arrives: 3 routines (Full-body A/B/C), 6 exercises each, dumbbell-only, supersets to fit 45 min, `linear` progression with 2.5 kg steps except double progression on curls, Mon/Wed/Fri schedule, per-exercise rationales, muscle-map preview showing balanced coverage, arms slightly emphasised.
6. She types "swap goblet squats for split squats, and I can do maybe 2 pull-ups" → revision arrives: split squats in, pull-ups replaced by band-assisted with a note to revisit in 6 weeks.
7. **Accept plan** (with "use this weekly schedule" on) → routines added, week set, toast: "Your plan is live — Wednesday is next." Coach log records intake, both iterations, acceptance.

### J3 — Periodic review, partial accept
1. Tom (self-hosted, trains 4×/week, logs RPE) enabled *weekly* reviews.
2. Sunday evening the review runs server-side. His last 4 weeks: bench stalled twice (engine deloaded once), every top set RPE ≥ 9.5; squats progressing; two Friday sessions rescheduled to Saturday; body weight flat vs. a gain goal.
3. Push notification: "Coach: 4 suggestions after this week." Home shows the proposal card.
4. The diff: (1) swap bench → DB press for 4 weeks *(stall + effort evidence)*; (2) bench accessory volume −1 set *(recovery)*; (3) move Friday's routine to Saturday in the weekly plan *(you've done that 3 weeks running)*; (4) note (no change): "weight flat for 4 weeks while aiming to gain — eat more or adjust the goal."
5. Tom accepts (1) and (3), rejects (2). The two changes apply, previous plan snapshotted, log updated. Next Sunday the Coach knows (2) was declined and doesn't nag.

### J4 — On-demand review with context
1. Ana's shoulder started pinching. **Plan → Coach → Ask for a review**, note: "right shoulder pinches on overhead work since last week".
2. Proposal: overhead press and incline swapped for neutral-grip / landmill-style alternatives *available with her equipment*, volume held, a Coach note advising a professional if pain persists (D6). She accepts all; her limitation is saved to her Coach profile so future proposals remember it.

### J5 — Failure path
1. Leo hits **Ask for a review**; the owner's CLI session has expired.
2. The job fails in seconds; Leo sees "The Coach couldn't run — the instance owner needs to check its setup", his day is otherwise unchanged (P6); nothing is retried behind his back.
3. Admin dashboard Coach card shows the exact error ("claude: not authenticated") with a timestamp; the owner re-auths; Leo's next tap works.

### J6 — Regret & revert
1. A week after accepting a review, Nina feels the new split doesn't suit her. **Plan → Coach → log → Revert last applied changes.**
2. The pre-change snapshot is restored (routines + week). Her logged workouts from the week stay exactly as logged; the engine derives targets from history as always. The revert itself is logged.

### J7 — The skeptic
1. Sam's instance never sets a provider. Sam never sees the word Coach anywhere. Every journey in §3.2 is unchanged, byte for byte.

---

## 10. Functional requirements

Numbered for the technical plan to trace. **[M]/[S]/[C]** as before.

### 10.1 Provider & instance configuration

- **FR-01 [M]** The instance selects at most one active provider: `claude` | `gemini` | `codex` | `custom`, via instance configuration; absence = feature fully off (Epic F).
- **FR-02 [M]** Provider adapters invoke the CLI **non-interactively** ("headless": prompt in, machine-readable result out) and must not require a TTY.
- **FR-03 [M]** The `custom` provider is any owner-supplied command honouring the same contract (documented), enabling local models or future CLIs without code changes.
- **FR-04 [M]** openGym never stores or asks for model API keys/accounts in its UI; CLI authentication is owned by the instance owner outside openGym.
- **FR-05 [M]** Admin dashboard exposes: configured provider, CLI availability, auth status (as reported by a test call), last job time/outcome, last error; plus a manual test action (A2).
- **FR-06 [S]** Per-profile daily job cap, owner-configurable, default 10; exceeded requests fail with a clear message (A3).
- **FR-07 [M]** At most one Coach job runs per profile at a time; a second request while one runs is rejected with "already thinking".

### 10.2 Consent & privacy

- **FR-08 [M]** Coach features require per-profile opt-in consent (D1); consent records timestamp + disclosure version; revocation is immediate (D5).
- **FR-09 [M]** The consent screen lists the exact data categories shared (FR-10), names the configured provider, states that processing happens under the instance owner's provider account, and includes the not-medical-advice disclaimer.
- **FR-10 [M]** Job payloads are **minimised** to: unit, language, effort scale; Coach intake profile; routines + week (+ per-exercise config incl. progression settings); the review window of workouts (dates, exercise ids/names, per-set values incl. done flags and effort, targets, PR flags, durations); body-weight series in the window + goal; derived aggregates (stalls, adherence counts, muscle-balance summary, e1RM trend); custom-exercise names/body parts/descriptions in use.
- **FR-11 [M]** Job payloads **exclude**: profile display name and user id (an opaque handle is used), passkey/credential data, invite data, push subscriptions, theme/appearance settings, any other profile's data.
- **FR-12 [M]** Admins cannot view intake answers, payloads, proposals or Coach notes of other users (A4); admin visibility is limited to job counts, timestamps and error states.
- **FR-13 [M]** All free text the user provides (intake, refinement, review notes) is treated as data for the Coach, never as instructions to openGym itself; it cannot alter provider selection, caps, or another profile's anything.

### 10.3 Plan creation

- **FR-14 [M]** Intake collects the fields in B1; all except goal and days/week are skippable; answers persist as the editable **Coach profile** (Settings) reused by every later job.
- **FR-15 [M]** Creation output is a **complete plan bundle** structurally equivalent to the existing `opengym_plan` format (routines incl. `mode`, `sets`, `reps|sec|min/speed`, optional `weight` baselines, `prog`/`inc`/`repsMin`, `sg` supersets; week map; proposed custom exercises), extended with per-routine and per-exercise rationale text.
- **FR-16 [M]** Every exercise reference must resolve against the instance's library or the bundle's own proposed customs; unresolvable items invalidate the proposal *before* it reaches the user (mirror of `parsePlan` semantics — never silently dropped into a broken plan).
- **FR-17 [M]** Proposals must respect intake constraints: chosen training days count, session length (approximated via set counts + rest), equipment list, stated limitations.
- **FR-18 [M]** Applying a created plan uses plan-import merge semantics (B4): new routine ids, optional week replacement, never mutating existing routines.
- **FR-19 [M]** Refinement (B3) operates on the pending proposal with the user's free text; each iteration fully replaces the pending proposal and is logged.
- **FR-20 [S]** For users with history, proposed baselines for known exercises must not exceed the user's logged working weights (B2); the Coach states the history window used.
- **FR-21 [S]** Proposed custom exercises are allowed only when the library lacks a fit, are clearly badged in the review UI, and follow the existing custom-exercise shape (name, body part, description).

### 10.4 Recalculation (Coach review)

- **FR-22 [M]** A review job consumes the evidence set of C2 for the window since the last review (bounded, e.g. ≤ 12 weeks / ≤ 60 sessions) and the user's optional note.
- **FR-23 [M]** Review output is a **change-set**: ordered list of changes, each `{type, target, before, after, why}` from the closed type list in C3, plus optional advice-only notes and a short overall summary.
- **FR-24 [M]** Change-sets touch only: `routines[]` (structure/config/policies), `week{}`. They never touch `workouts`, `bodyweight`, `exWeights`, `dayPlan`, `customEx` (beyond FR-21 additions), or settings (C4).
- **FR-25 [M]** A review that finds nothing actionable returns a "no changes" outcome with a one-paragraph reading of the period (C5); it produces no pending proposal and no notification.
- **FR-26 [M]** Rejected changes are recorded and included as context in subsequent reviews, so the Coach doesn't re-propose a freshly declined change without new evidence (J3 step 5).
- **FR-27 [S]** Effort semantics: RIR/RPE, where present, must be interpreted on the app's published scale mapping (RPE ≈ 10 − RIR; RPE floor 6, RIR 0 = failure) (C6).
- **FR-28 [S]** Session ratings/notes (F9), where present, are part of the evidence set and citable in rationales.

### 10.5 Proposals: review, apply, revert

- **FR-29 [M]** The proposal screen shows: summary, evidence window, the change list with per-change accept/reject controls and rationales, a before/after plan preview, and (S) the muscle-map preview (B6).
- **FR-30 [M]** Apply is atomic over the accepted subset; before applying, the current `{routines, week}` is snapshotted with timestamp and proposal reference (D2).
- **FR-31 [M]** Revert restores the most recent snapshot (D3); snapshots retained: at least the last 3 (bounded — the whole state must stay within the existing 5 MB sync body limit).
- **FR-32 [M]** Staleness: if the plan changed after the proposal was computed (manual edit on any device), affected changes are marked stale and cannot be applied; the screen offers a fresh review instead (sync is last-write-wins, so validation happens against the state present at apply time).
- **FR-33 [M]** At most one pending proposal per profile (E3); superseded/expired proposals move to the log. Pending proposals expire after a bounded period (suggested 14 days).

### 10.6 Triggers & cadence

- **FR-34 [M]** Manual triggers: plan creation (from first-run card or Plan screen), review request with optional note (from Coach screen), refinement (from proposal screen).
- **FR-35 [M]** Scheduled trigger per profile: off (default) | weekly (day/time, profile's timezone — same mechanism as the existing workout reminder) | after every N completed workouts (N = 1–20, suggested default 4).
- **FR-36 [M]** Scheduled reviews run server-side without the app open, against the last-synced state; they skip (silently, logged) when: consent revoked, cap reached, provider down, no new completed workout since last review.

### 10.7 Notifications

- **FR-37 [M]** Proposal-ready notifications reuse the existing Web Push channel and its opt-in; new tag (e.g. `coach-proposal`); deep-link to the proposal.
- **FR-38 [M]** Notify only when a proposal with ≥ 1 change exists (E2); failures and no-change outcomes never push (E4).
- **FR-39 [M]** In-app surfacing is independent of push: Home shows a Coach card whenever a proposal is pending or a job is running.

### 10.8 Coach log & auditability

- **FR-40 [M]** Per profile, every job appends a log entry: timestamp, trigger, provider, evidence-window summary, outcome (proposal id / no-change / error class), user decision(s), applied change list with before/after values.
- **FR-41 [M]** The log and Coach settings are part of the profile state: synced, included in JSON backup export, restored by import, size-bounded (e.g. last 50 entries; payloads themselves are summarised, not stored verbatim).
- **FR-42 [S]** The admin status card keeps an instance-level rolling log of job outcomes (no contents), enough to debug "it stopped working on Tuesday".

### 10.9 Internationalisation

- **FR-43 [M]** All new UI strings ship in all 12 supported languages, same bar as every other feature.
- **FR-44 [M]** Coach-generated text (rationales, summaries, notes) is requested in the profile's language (`S.lang`); English is the declared fallback when the provider under-delivers.
- **FR-45 [S]** Exercise names in Coach output use the same source as the rest of the app (library names; localisation limits already documented there).

### 10.10 Failure handling & availability

- **FR-46 [M]** Jobs are asynchronous with visible states: queued → thinking → ready | no-change | failed; the user can navigate away and return; the app remains fully usable throughout (F3).
- **FR-47 [M]** Jobs have a hard timeout (suggested 5 min); on timeout/failure the user sees a plain-language reason class (not configured / unavailable / not authenticated / took too long / produced an unusable answer) — the raw detail goes to the admin card.
- **FR-48 [M]** Output that fails validation (unknown ids, illegal change types, malformed structure) is **never partially applied**; one automatic repair round-trip is allowed, then the job fails clean.
- **FR-49 [M]** Manual retry is always available (subject to caps); scheduled jobs retry only at their next tick.

### 10.11 Data, sync, backup

- **FR-50 [M]** All new per-profile data (consent, Coach profile, cadence, pending proposal, log, snapshots) lives in the existing state blob: synced across devices, exported/imported with backups, wiped by "Reset everything", subject to the 5 MB limit (hence all retention bounds above).
- **FR-51 [M]** "Import backup" (full replace) and profile deletion behave with Coach data exactly as with all other data — no orphaned server-side residue beyond the standard state file.

### 10.12 Guardrails

- **FR-52 [M]** Stated limitations/injuries persist in the Coach profile and constrain every subsequent proposal (D6).
- **FR-53 [M]** Free text describing pain yields conservative programming plus a see-a-professional note; the Coach never diagnoses.
- **FR-54 [M]** The Coach's writing is honest about uncertainty and cites the user's data, in keeping with the progression engine's visible-*why* standard (P2).

### 10.13 Non-AI parity

- **FR-55 [M]** With no provider configured, the shipped app is behaviourally and visually identical to today (Epic F1) — verified as an explicit test scenario.
- **FR-56 [M]** With a provider configured but consent not given, the only difference is the dismissible "Meet the Coach" entry points.

---

## 11. Non-functional requirements

- **NFR-1 Latency.** Plan creation and reviews are minutes-scale, async by design (FR-46); intake and proposal review interactions themselves are instant. No synchronous UI path may wait on the CLI.
- **NFR-2 Cost.** One job ≈ one CLI session on the owner's account. Caps (FR-06), cadence bounds (FR-35) and no-change suppression (FR-25) keep costs proportional to value. Documentation gives owners a rough cost picture per provider.
- **NFR-3 Security.** The server executes only the pre-configured provider command — never user-supplied commands; user free text enters prompts as quoted data (FR-13). The CLI runs with access to the job payload only, not to `./data` at large (technical plan to specify sandboxing).
- **NFR-4 Privacy.** Data minimisation per FR-10/11; no telemetry added; the feature works entirely within the owner's machine + their chosen provider's API.
- **NFR-5 Licensing.** CLIs are external tools invoked at runtime (not linked/bundled); AGPL v3 posture unchanged. Provider CLIs' own terms are the owner's to accept.
- **NFR-6 Testability.** Proposal validation, change-set application, snapshot/revert and staleness rules are pure functions with tests, matching the repo's existing standard (`frontend/src/lib/` + Vitest). A fake provider (fixture CLI) enables end-to-end tests without any AI account.

---

## 12. New & changed surfaces

| Surface | Change |
|---|---|
| **Home** | First-run *Welcome!* card gains **Let the Coach build it** (AI-enabled + consented instances). New Coach card when a job is running or a proposal is pending. |
| **Plan** | Header gains a **Coach** entry → Coach screen: status, *Ask for a review* (+ note), pending proposal, cadence shortcut, log. |
| **Proposal screen (new)** | Summary · evidence window · per-change accept/reject with rationale · before/after preview · muscle-map preview · Apply / Discard / Refine (creation) buttons. |
| **Intake wizard (new)** | Guided screens per B1; editable later as *Coach profile* in Settings. |
| **Settings** | New **Coach** group (visible only on AI-enabled instances): consent state & revoke, Coach profile, automatic review cadence, view log, turn off. |
| **Finish summary** | (F9, Should) optional one-tap session rating + note. Subtle "the Coach will look at this week on Sunday" line when cadence is on. |
| **Admin dashboard** | **Coach status card**: provider, health, test button, last error, instance-level job counts. |
| **Login/consent** | No change to auth; consent is in-app post-login. |
| **Docs** | README feature list & roadmap, `.env.example` (provider block), `docs/SELF_HOSTING.md` (CLI install/auth per provider), CHANGELOG. |

---

## 13. Data additions (functional sketch)

Final shapes belong to the technical plan; functionally, the profile state gains one namespace (bounded, sync-safe):

```
S.coach = {
  consent:   { agreedAt, version } | null,
  profile:   { goal, experience, daysPerWeek, preferredDays[], sessionMin,
               equipment[], limitations, likes, dislikes, notes },      // editable intake
  cadence:   'off' | { weekly: {day, time} } | { everyWorkouts: N },
  lastReview:{ at, workoutId } | null,
  pending:   Proposal | null,                    // exactly one (FR-33)
  log:       LogEntry[],                         // bounded (FR-41)
  snapshots: PlanSnapshot[]                      // bounded (FR-31)
}

Proposal   = { id, createdAt, kind: 'create'|'review', basedOn: {from,to,sessions, planHash},
               summary, changes: Change[], notes: string[], iteration }
Change     = { id, type, target, before, after, why, status: 'proposed'|'accepted'|'rejected'|'stale' }
PlanSnapshot = { at, proposalId, routines, week }
Workout    += { rating?: 'easy'|'right'|'hard', note?: string }         // F9 (Should)
```

Instance side (not user state): provider configuration (env), job queue/status, instance job log — all technical-plan territory.

---

## 14. Suggested delivery phasing

| Phase | Contents | Rationale |
|---|---|---|
| **1 — MVP** | F1 provider config (one adapter: Claude Code CLI) + admin status/test · F2 consent & settings · F3 plan creation + F4 refinement · F7 review/apply/revert · F8 log · on-demand reviews (F5) · Epic F parity · i18n | The full trust loop (propose → review → apply → revert → audit) must exist from day one; cadence can wait, trust can't. |
| **2** | F6 periodic reviews + push notifications · remaining provider adapters (Gemini CLI, Codex CLI, custom) · usage caps · F9 session rating | Automation and breadth once the loop is proven. |
| **3 (nice-to-have)** | Demo-build canned proposal (marketing value) · per-job cost surfacing where the CLI reports it · richer Coach-profile editing | Polish. |

Target release: **v1.3.0** (this would headline the roadmap's "more starter plans" line by superseding it).

---

## 15. Explicitly out of scope (for now)

- AI-prescribed per-session loads or AI overriding the progression engine's targets (revisit only if D1 is revisited).
- Chat with the Coach during a workout; real-time set-by-set advice.
- Nutrition, sleep, or body-measurement coaching.
- Form analysis (video or otherwise).
- Percentage/training-max programs (separate roadmap item; the Coach may *recommend* them once they exist).
- Coach on the standalone mobile app or demo build (no server); guest access (privacy promise conflict — §5).
- Multi-user coaching (an admin "coach view" over family members' plans).
- Automatic plan changes without approval (auto-apply was explicitly not chosen — D4).

---

## 16. Open questions for the technical plan

1. **Where the CLI runs:** on the host vs. inside a dedicated `ai` compose service (image with the CLIs preinstalled?); how the owner's CLI auth persists across container restarts; filesystem/network sandbox for the agent process.
2. **Contract:** exact prompt/response schema per adapter (all three CLIs support non-interactive JSON-ish output; normalise where they differ), the one-repair-round policy (FR-48), and how the library (1,324 ids) is exposed to the agent (full dump vs. search tool vs. curated subset).
3. **Job execution:** queue, persistence of job status across API restarts, timeout enforcement, concurrency (FR-07) on a single-process Node server.
4. **Scheduling:** reuse of the existing reminder tick loop (`api/server.js`) for cadence checks vs. a separate scheduler.
5. **State growth:** enforcing log/snapshot bounds against the 5 MB `PUT /api/data` cap; whether snapshots store full routines or structural diffs.
6. **Staleness detection:** plan hashing strategy for FR-32 under last-write-wins sync.
7. **Guest mode (product question deferred):** is a "Coach runs but data stays ephemeral server-side" mode ever acceptable, or does guest = no Coach stay permanent?
8. **Rate limiting & abuse:** per-profile caps are functional; do we also need instance-wide daily ceilings?
9. **Fixture provider:** shape of the fake CLI used in CI (NFR-6).

---

## 17. Glossary

| Term | Meaning |
|---|---|
| **Coach** | The AI capability as a whole (working name; final naming/copy during implementation). |
| **Provider / CLI agent** | The locally-installed AI CLI the server invokes: Claude Code CLI, Gemini CLI, OpenAI Codex CLI, or a custom command. |
| **Intake / Coach profile** | The structured answers (goal, availability, equipment, limitations…) + free text, stored and editable, reused by every job. |
| **Proposal** | The inert result of a Coach job: a created plan bundle or a review change-set, awaiting user decisions. |
| **Change-set** | Ordered list of discrete, typed plan changes with rationales (review output). |
| **Evidence window** | The slice of training history a review is based on (since last review, bounded). |
| **Snapshot** | The `{routines, week}` copy taken before applying accepted changes; the unit of revert. |
| **Progression engine** | The existing deterministic policy code (`frontend/src/lib/progression.js`) that derives each session's targets from history. Unchanged by this feature. |
| **Plan bundle** | The existing `opengym_plan` share format (routines + week + custom exercises), reused as the shape of created plans. |
