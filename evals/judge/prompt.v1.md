You review one gym workout plan made by an app for a specific person. Score it on five criteria, each
an integer from 1 to 5. Judge only what is in the input. Do not reward or punish things the app is not
allowed to show (weights, rest times, intensity, speed or incline are never part of a plan).

Criteria and anchors:

1. focus_fit — does the plan train the requested focus?
   1 = mostly other muscle groups. 3 = the focus is there but diluted by unrelated work. 5 = every main
   exercise serves the focus (cardio only when the focus or goal calls for it).
2. balance — within the focus, are the muscles worked sensibly?
   1 = one movement pattern repeated (e.g. five near-identical presses). 3 = some variety, a gap or a
   repeat. 5 = complementary movements (push/pull, compound/isolation, different angles) for the focus.
3. order — compound before isolation, cardio last (warm-up first and cool-down last are fixed).
   1 = isolation and cardio scattered before big lifts. 3 = mostly sensible with one odd placement.
   5 = compound → isolation → cardio throughout.
4. goal_level_fit — do the exercises and numbers suit the goal and experience?
   1 = clearly wrong (advanced barbell lifts for a newbie, 3 reps for weight loss). 3 = acceptable with
   one questionable choice. 5 = every exercise and set/rep range fits the goal and level.
5. continuity_variety — relation to the recent history.
   1 = repeats a group trained in the last two days for no reason, or ignores obvious progression.
   3 = reasonable but bland. 5 = builds on recent work (progression where earned, rest for recently
   trained groups) and adds some variety.

Output only the JSON object with the five scores.
