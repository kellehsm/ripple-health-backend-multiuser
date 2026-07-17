# Ripple Wellness — Backend DEV (CLAUDE.md)

This is the **development** working copy of the backend. All new feature work and fixes happen here first.

## Dev environment

| | Production | Dev (this directory) |
|---|---|---|
| Directory | `/root/wellness-app-multiuser/backend` | `/root/wellness-app-multiuser-dev/backend` |
| Git branch | `master` | `dev` |
| Port | 4001 | **4002** |
| Database | `wellness_multiuser` | **`wellness_multiuser_dev`** |
| Screen session | `wellness-prod` | **`wellness-dev`** |
| Log file | `/tmp/prod-backend.log` | `/tmp/dev-backend.log` |

Both repos are git worktrees — same remote (`kellehsm/ripple-health-backend-multiuser`), different branches.

## Starting / restarting the dev backend

```bash
# Check existing sessions first
screen -ls

# If wellness-dev is missing, start it:
screen -dmS wellness-dev bash -c 'cd /root/wellness-app-multiuser-dev/backend && npm run dev 2>&1 | tee /tmp/dev-backend.log'

# Verify
curl http://localhost:4002/health
```

**NEVER run `npm run dev` outside the `wellness-dev` screen session.**

## Database

- Dev DB: `wellness_multiuser_dev` (PostgreSQL, same host/user as prod)
- Schema + migration were applied at setup — already initialized
- If you need to wipe and re-apply:
  ```bash
  sudo -u postgres psql -c "DROP DATABASE wellness_multiuser_dev;"
  sudo -u postgres createdb wellness_multiuser_dev
  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE wellness_multiuser_dev TO wellness_user;"
  sudo -u postgres psql wellness_multiuser_dev -c "GRANT ALL ON SCHEMA public TO wellness_user;"
  sudo -u postgres psql wellness_multiuser_dev < /root/wellness-app-multiuser-dev/backend/schema.sql
  sudo -u postgres psql wellness_multiuser_dev < /root/wellness-app-multiuser-dev/backend/migrations/003_jsonb_context_and_sync_log.sql
  sudo -u postgres psql wellness_multiuser_dev < /root/wellness-app-multiuser-dev/backend/migrations/004_unique_constraints_for_restore.sql
  sudo -u postgres psql wellness_multiuser_dev < /root/wellness-app-multiuser-dev/backend/migrations/005_users_auth_columns.sql
  sudo -u postgres psql wellness_multiuser_dev -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO wellness_user; GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO wellness_user;"
  ```

## Promoting dev → production

When changes are confirmed working on dev:

1. **Commit and push on `dev` branch** (from this directory):
   ```bash
   git add -A && git commit -m "..." && git push origin dev
   ```

2. **Merge into production** — two options (ask the user which they prefer):
   - **Direct merge (no PR):** In `/root/wellness-app-multiuser`:
     ```bash
     git fetch origin && git merge origin/dev && git push origin master
     ```
   - **Pull request:** Open a PR from `dev` → `master` on GitHub for review before merging.

3. **Restart production backend** to pick up the changes:
   ```bash
   screen -S wellness-prod -X quit
   screen -dmS wellness-prod bash -c 'cd /root/wellness-app-multiuser/backend && npm run dev 2>&1 | tee /tmp/prod-backend.log'
   curl http://localhost:4001/health
   ```

## Inherited operational rules (apply here too)

- VPS IP: `129.121.125.214`, domain: `app.kels.gg` (Caddy → port 4001 for production only)
- **Do NOT run `eas build` without explicit user approval.**
- Correlation language: descriptive only, never diagnostic or causal.
- Before assuming a feature is broken, check the database directly first.
- Week-start boundary logic reads `user_settings` — never hardcode Monday/Sunday.
- Dexcom: use `LoginPublisherAccountById`; `WT` timestamp has no leading slash.
- Never log or expose credential values in API responses.

## Git

Both worktrees share the same `.git` history. Dev branch diverges from master — commit freely here, merge to master only when confirmed working.
