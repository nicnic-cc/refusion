# Beads in this repo

The generic rules for working with beads are in the `beads` skill: load it before any bead work. `.agents/AGENTS.md` holds this repo's rules on top of them.

## Databases

| Folder | Prefix | Holds |
| --- | --- | --- |
| `.beads/` | `rf` | All work on this fork |

## This repo's additions

- Every change to the app, however small, starts as a bead: plan it, show the draft bead, create it on the user's go, then build. Overrides the skill's "one-session work needs no bead". Doc-only and bead-housekeeping commits are exempt.
- Passing checks don't finish an app bead. After building, report and stop: the user tries it in the running app. Commit and close only on their OK.
