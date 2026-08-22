# Ripple Wellness — CLAUDE.md

Expo/React Native (TypeScript) + Fastify/Postgres wellness app. This file is shared by both checkouts — **check your current directory to know where you are**:

- `/root/wellness-app-multiuser-dev` — **dev repo** (`dev` branch). ALL development happens here.
- `/root/wellness-app-multiuser` — **PRODUCTION worktree** (`master`). Never develop here; it only receives merges from dev (which deploys the files) and hosts the running prod backend.

## Master docs — read the right one before working

| Doc | Consult for |
|---|---|
| `docs/FEATURES.md` | What the app does — feature domains, their screens, routes, tables, status |
| `docs/BACKEND.md` | Backend architecture, route map, jobs, DB/migrations, environments, deploy procedure, integrations, env vars |
| `docs/FRONTEND.md` | Frontend structure, navigation, API layer, theme/font system, sync queue, EAS build policy, known constraints |
| `docs/UX_UI.md` | Design system — colors, typography, card anatomy, spacing, required component states, copy rules, new-screen checklist |
| `docs/INSIGHT_ENGINE.md` | Insight engine architecture, full rule catalog, golden-set testing, how to add a rule, upgrade roadmap |
| `docs/POLISH_BACKLOG.md` | Queued polish ideas — pick from it, or append new ideas |

Superseded docs live in `docs/archive/` — reference only, never follow them.

## Doc maintenance rule (mandatory)

**Every task must end with a doc update.** After completing any task, update the relevant master doc(s) in the same commit:
- New/changed feature → `docs/FEATURES.md` (and `docs/INSIGHT_ENGINE.md` if insight rules changed)
- Backend/route/job/env/deploy change → `docs/BACKEND.md`
- Frontend architecture/navigation/build change → `docs/FRONTEND.md`
- New or changed design rule → `docs/UX_UI.md`
- New polish idea surfaced (yours or the user's) → append to `docs/POLISH_BACKLOG.md`; remove items once shipped

If a task changes nothing a doc describes, no update is needed — but check before assuming.

## Hard rules

- **Never commit without showing the diff and getting explicit approval.**
- **Never merge to master, push to production, or restart the prod backend without explicit approval.** (Deploy procedure: `docs/BACKEND.md`.)
- **Never start a build unprompted — but run a LOCAL build whenever the user asks for one.** "do a build" / "build now" / "local build" is sufficient authorization to run `eas build --platform android --profile preview --local`. Remote EAS builds stay off-limits (limited credits) unless the user names remote explicitly. Batch native changes; JS-only changes need no build. Bump `app.json` version + `android.versionCode` + `package.json` before any build; merge dev→master first.
- **Never use `sed -i`** — it truncated a source file to 0 bytes in this repo. Use the Edit tool.
- Push frontend changes to the `frontend` remote, backend changes to `origin`, both if both changed.
- Timestamps in user-facing status updates are EST.
- Never log or expose credential values.

## Common bug pattern to check first

Multiple "this feature doesn't work" reports turned out to be **working backend logic with no UI displaying the result**. Before rewriting a log/save function, check whether the data is landing in the database — if it is, it's a display/wiring issue.
