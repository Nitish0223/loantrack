# Branching model

**Model followed: a simplified Git Flow.**

- `main` is always deployable and only receives `develop` at release points, each
  marked with an annotated tag: `v1.0.0` when the app worked under Docker Compose
  (PR #6) and `v1.1.0` when it worked on Kubernetes (PR #10).
- `develop` is the integration branch and the repository's default branch.
- One `feature/*` branch per part (`backend-app`, `frontend-app`, `database`,
  `docker`, `k8s-manifests`, `k8s-operations`, `deploy-script`, `docs`), branched
  from `develop` and merged back through a PR with a description and a review
  comment on my own diff. Merges use merge commits, not squash, so every commit stays
  visible, and no branch was deleted.
- A GitHub ruleset on `main` and `develop` requires a pull request and blocks force
  pushes and deletion, so the "no direct commits" rule is enforced, not just followed.
  The only direct commit is the repository's initial README, made before any branch
  could exist.

**One mistake, kept in the history:** PR #1 (backend) was opened against `main`
because `main` was still the default branch. Instead of rewriting history I merged
`main` back into `develop` in PR #2 and made `develop` the default branch so new PRs
target it automatically.

**Would I recommend it to a team of five shipping daily? No.** Git Flow's long-lived
`develop` branch and batched releases add a second integration step and make releases
events instead of routine. For five people shipping every day I would use trunk-based
development: short-lived branches (hours, not days) merged into `main` through small
PRs with required CI checks, unfinished work hidden behind feature flags, and
every merge to `main` deployable, with tags or the commit SHA identifying releases.
That keeps merge conflicts small and lets every change reach production the same day.
Git Flow fits better when you ship versioned releases on a slower cadence or must
maintain several released versions in parallel.
