# Gym Coach: Design Brief (v0.2)

> **Status (2026-10-25): fulfilled and superseded.** Claude Design delivered the handoff in `docs/design/handoff/`. Where this brief and the handoff differ (for example "Edit workout" is now "Edit with AI"), the handoff wins. This brief is kept for history.

**Purpose.** Input for Claude Design. Behaviour is fixed by the PRD (`docs/gym-coach-prd.md`) and the engineering doc (`docs/engineering/engineering-doc.md`). If this brief and the PRD disagree, the PRD wins. Design decides layout, look and feel, not features.

**1. Product.** A phone-first web app where an AI coach builds each day's workout from the time you have, the equipment you can use and what you trained recently. The user stays in control: they review, edit, accept and complete every plan.

**2. Users and context.** Casual, fairly inexperienced gym-goers with no trainer. The pilot is the owner plus up to 20 friends in India, with mixed experience. Used mostly on a phone in the gym. *Assumed, not in the PRD:* quick glances between sets, often one hand, frequent interruptions. English only; online only.

**3. Goal and tone.** The user goes from opening the planner to an accepted plan in about 2 minutes, understands it at a glance, and always feels in control.
- **Tone (owner): honest, no fluff, to the point.** Short sentences. Say what happened and what to do next. No hype or motivational slogans. *My reading, confirm:* no exclamation marks, no emoji.
- Coach messages are fixed text from the PRD catalog (Appendix A), so the designer designs for that text and doesn't write new coach copy.

**4. Core flow (design around this).**
- **Daily loop:** Planner → Suggest Workout → plan cards → adjust → Accept → train → Workout completed + rating (Easy / Just right / Hard) → History.
  - **Planner inputs:** session length 30 / 45 / 60 min; focus "Let coach choose" or any of 8 groups (Chest, Back, Shoulders, Biceps, Triceps, Legs, Core, Cardio); a "Last trained…" line; an optional note of up to 300 characters.
  - **Adjust:** edit directly on the cards; or "Edit workout" with a request of up to 300 characters (5 per workout); or Reset (optional reason).
- **Once only:** sign up → verify email → log in → profile (name, goal, experience, days per week) → equipment (everything preselected; optionally detect from photos).
- **Hero screen: the plan screen.** Design it first.

**5. Rules the design must follow.**
- Exactly three card types:
  - **Reps:** name · sets · reps · time.
  - **Timed:** name · sets · time per set · time.
  - **Activity:** warm-up and cool-down, 5 min each.
  - Cards never show rest, weight, intensity, speed or incline.
- Warm-up comes first and cool-down last. A header shows the focus and the reason. Total time is always visible, with a soft warning if edits push it past the session length.
- Tapping a card opens how-to (instructions and an image from the database).
- Direct edits: steppers for sets, reps and time; delete with undo; reorder by drag handle plus ↑/↓ buttons.
- After a text edit, changed cards get an "Updated" tag and a highlight (never colour alone).
- An accepted plan is locked: only Reset (with a confirmation) and Workout completed remain.
- Coach messages appear in a banner slot; no chat bubbles or free-form coach text.
- Also design: red-flag stop, daily limit reached, usage limit reached (`SPEND_CAP`), expired plan, error, and loading ("Still working…" after 8 s).

**6. Must NOT appear.** Chat or coach-written text; progress charts, streaks or badges; rest timers, set tick-off or weights; nutrition or calories; social or sharing; reminders; age, sex, height or weight fields; editing a completed workout; per-exercise logging; supersets; Google sign-in.

**7. Build constraints.**
- Responsive web, phone-first: design at 390 × 844 and check 360. On desktop the content column is centred, 480 px at most.
- Built with Tailwind v4 and shadcn/ui (Radix) with lucide icons. Use these components so the design builds directly.
- A bottom tab bar (Plan · History · Profile). Main actions sit in a sticky bar above it, clear of the iPhone home bar.
- Bottom sheets for Edit workout, Reset, Complete and How-to.

**8. Accessibility (WCAG 2.2 AA).** Text contrast 4.5:1 (3:1 for large text and controls); touch targets at least 44 px; meaning never by colour alone; honour reduced motion; text inputs at least 16 px.

**9. Visual direction (owner inputs).**
- **Apps liked:** Airbnb, Claude, Dropbox, Instagram. Reasons not stated; we'll learn them from which option is chosen. Borrow qualities, not layouts or branding: Gym Coach has no user photos (images appear only as exercise pictures in How-to).
- **Mood: energetic.** *Interpretation, confirm in review:* a clean, uncluttered light base like those apps, with the energy coming from one saturated accent colour and confident type, not decoration.
- **Theme: light only for the MVP.** Define colours as named tokens anyway; dark mode is not designed.
- **Logo: the wordmark "Gym Coach", text only, no symbol.** Ask for one simple square version derived from it for the home-screen icon and favicon; the owner approves it.
- **Accent colour: not chosen.** The three options below should differ in accent colour.

**10. The ask, in order.**
1. The plan screen (draft state) in **3 visual directions**, using the sample data below. All three are light and energetic; they differ in accent colour, type personality and card density. Include the worst cases: very long names, 10 exercises, the over-time warning, "Updated" tags.
2. After a direction is chosen: foundations (colours, type, spacing, corner radius, motion) and a component sheet using shadcn components. Token names must map to Tailwind.
3. Then the other planner and plan screens, the states from section 5, and a clickable prototype of the core flow.

**Attachment: sample data** (illustrative names, not from the exercise database)

*Planner:* 45 min · "Let coach choose" · "Last trained: Legs 2 days ago · Back 4 days ago · Chest 6 days ago · Triceps 9 days ago".
*Header:* "Coach picked Chest & Triceps — rested at least 6 days".

| # | Card | Type | Shows |
|-|-|-|-|
| 1 | Warm-up: Upper-body push | Activity | 5 min |
| 2 | Dumbbell bench press | Reps | 4 sets · 10 reps · 6 min |
| 3 | Incline dumbbell press | Reps | 3 sets · 10 reps · 4 min |
| 4 | Push-up | Reps | 3 sets · 12 reps · 4 min |
| 5 | Cable chest fly | Reps | 3 sets · 12 reps · 4 min |
| 6 | Bench dip | Reps | 3 sets · 12 reps · 4 min |
| 7 | Overhead dumbbell triceps extension | Reps | 3 sets · 12 reps · 4 min |
| 8 | Plank | Timed | 3 sets · 30 s · 4 min |
| 9 | Cool-down: Chest and arm stretch | Activity | 5 min |

*Total:* about 41 min. Cards show whole minutes and the total comes from exact seconds, so the cards add up to 40 while the total says 41. Treat the total as "about N min".
*Stress cases:* the same plan with one long name ("Single-arm seated overhead dumbbell triceps extension"), and an over-time state ("This workout now runs about 52 min — longer than your 45 min.").
