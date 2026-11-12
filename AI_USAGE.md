# AI usage

Tool: **Claude Code** (Anthropic, Claude Opus model) running in my terminal on the
project folder. It drafted most files, ran builds and tests in my shell. 
I directed the work part by part, reviewed every file before
its PR, opened and merged the PRs .

| Task | Tool | Accepted as-is | Changed, and why |
|---|---|---|---|
| Plan and stack choice | Claude Code | Part-by-part plan, plain YAML instead of Helm, minikube | It proposed a Python/FastAPI backend; I chose **Node.js**. I asked to stop after every part for an explanation before moving on. |
| Backend API (`backend/src`) | Claude Code | Pool + exponential backoff, `/healthz` without DB, `/readyz` with DB, parameterized SQL, SIGTERM drain | Split into one commit per concern so the history explains intent. Later added `APP_VERSION` to make the v2 rollout visible. |
| Frontend + nginx | Claude Code | Static page, relative `/api` calls, `textContent` rendering, port 8080 | The first nginx config cached the backend IP and caused 502s; replaced with `resolver` + variable `proxy_pass` after testing a backend restart (ISSUES.md #2). |
| Migration + seed | Claude Code | `001`/`002` files in `initdb.d`, `NUMERIC(14,2)`, `CHECK (loan_amount > 0)` | None. |
| Dockerfiles + Compose | Claude Code | Multi-stage backend, pinned tags, non-root users, healthchecks, named volume, `service_healthy` | The frontend's build-time check stage was silently skipped by BuildKit; fixed with a marker file (ISSUES.md #4). Asked whether to push images to Docker Hub; kept local builds so no registry credentials are needed. |
| Kubernetes manifests | Claude Code | StatefulSet + `volumeClaimTemplates`, probes wired to `/healthz` and `/readyz`, ConfigMap/Secret split, NodePort frontend | I asked for higher resource limits, no HPA (it would fight `kubectl scale` in Part D) and one file per component. Liveness thresholds loosened after they killed healthy pods (ISSUES.md #1). |
| Deploy / teardown scripts | Claude Code | Idempotent `deploy.sh` (apply everywhere, secret via `--dry-run \| apply`), context pinned to minikube | Teardown initially left the PV behind so old rows reappeared; fixed after testing a fresh deploy (ISSUES.md #3). |
| Git / GitHub workflow | Claude Code + GitHub web UI | Branch ruleset requiring PRs on `main`/`develop`, annotated tags | PR #1 went to `main` because I did not change the base; fixed with a sync PR and `develop` as default branch. I wrote the PR descriptions and review comments from its drafts, adjusting them. |
| Documentation | Claude Code | Structure and evidence taken from real command output | Reviewed and edited for accuracy; assumptions listed in the README. |

**Where the AI was wrong or misleading.** Its first nginx config looked correct and
passed `nginx -t`, but it resolved the backend only once at startup; I only found the
502 by deliberately restarting the backend while the database was down, and confirmed
the cause by comparing nginx's upstream IP with `getent hosts backend`. It also wrote a
"build-time check" stage that never ran, which was invisible until I read the
`--progress=plain` build output step by step, and its first liveness settings and
first teardown script were too optimistic: both looked fine until a real stall and a
real teardown-then-deploy exposed them. Once, a cleanup command it ran
(`taskkill /IM node.exe`) stopped every Node process on my machine rather than just
the test server, so I now check what a command touches before letting it run.
