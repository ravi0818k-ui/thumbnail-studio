---
description: Run the checks, commit, push to main and verify the live site actually updated
argument-hint: [commit message]
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git branch:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(git rev-parse:*), Bash(npm run typecheck), Bash(npm run selftest), Bash(npm run build), Bash(curl:*)
---

Ship the working tree to https://youtubethumbnail.org.

`$ARGUMENTS` is an optional commit message. If it is empty, write one yourself from the diff, in the
style of the existing history (a short subject, then *why* the change is the way it is). If there is
nothing to commit, skip to the push — there may be local commits that were never pushed.

Deploy facts for this repo:

- Push target is `main`. `.github/workflows/deploy.yml` builds on every push and publishes `dist/` to
  GitHub Pages. There is no separate deploy step to run by hand.
- The GitHub CLI is **not installed** on this machine. Query the public API with `curl` instead of `gh`.
- Repo slug: `ravi0818k-ui/thumbnail-studio`. Live host: `youtubethumbnail.org`.

## 1. Preflight — do not push a broken tree

Run `npm run typecheck` and `npm run selftest`. Both must pass. If either fails, stop and report; do not
commit or push. Note that `scripts/` is outside `tsconfig.json`, so a script-only change is covered by
the selftest, not by the typecheck.

## 2. Commit

Show `git status --short` first. Confirm the branch is `main` (that is the branch Pages builds; do not
branch for a deploy). Stage and commit everything relevant, ending the message with the attribution line
this session was given.

## 3. Push

`git push origin main`.

## 4. Watch the run to completion

Poll until the newest run for your pushed SHA reports `completed`:

```bash
curl -s "https://api.github.com/repos/ravi0818k-ui/thumbnail-studio/actions/runs?per_page=1" | python -c "
import json,sys
r=json.load(sys.stdin)['workflow_runs'][0]
print(r['head_sha'][:7], r['status'], r['conclusion'])"
```

Sleep ~20s between checks; a green run takes roughly 1–2 minutes. **A `cancelled` or `failure`
conclusion means nothing shipped** — Pages keeps serving the previous artifact, so the site looks fine
while being stale. That exact failure has happened here: a run cancelled mid-`npm run build` uploaded no
artifact and the site silently stayed on a months-old bundle whose asset URLs still carried the old
`/thumbnail-studio/` base path. On a bad conclusion, fetch the failing step and report it:

```bash
curl -s ".../actions/runs/<run_id>/jobs" | python -c "..."   # print each step's conclusion
```

## 5. Verify the live site, not the local build

A green run is not proof. Check what is actually served:

```bash
js=$(curl -s -L "https://youtubethumbnail.org/" | grep -o '/assets/index-[^"]*\.js')
curl -sI "https://youtubethumbnail.org$js" | head -1      # must be 200
curl -sI "https://youtubethumbnail.org/favicon.svg" | head -1
```

Then confirm three things:

1. Every asset URL in the served HTML returns **200**, and none is prefixed `/thumbnail-studio/` — that
   prefix is the old `base` in `vite.config.ts` and means a stale artifact is being served.
2. The served bundle contains a **string unique to this change** (`curl -s -L "…$js" | grep -c "<text>"`).
   Pick a literal from what you just edited. This is the only check that proves the new code is live.
3. `/favicon.svg` returns 200.

## 6. Report

State the SHA range pushed, the run conclusion, and what you verified against the live site. Mention that
Pages sends `cache-control: max-age=600`, so a hard reload may be needed for up to ten minutes. If any
verification failed, say so plainly and do not describe the deploy as done.
