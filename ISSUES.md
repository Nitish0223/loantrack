# Issues faced

Real problems hit while building and testing LoanTrack, written up as they happened.
Each one: **Symptom -> Diagnosis (commands in order) -> Root cause -> Fix.**

## 1. A liveness probe killed healthy containers (Kubernetes)

**Symptom.** With nothing changed, `kubectl get pods -n loantrack` showed restarts:

```
pod/backend-85cf5cdb49-lv6tc    1/1   Running   1 (3m27s ago)
pod/frontend-66c5c74f4-rh6mc    1/1   Running   1 (3m26s ago)
```

**Diagnosis.**

1. Why did the container stop?
   ```
   $ kubectl get pod backend-85cf5cdb49-lv6tc -n loantrack \
       -o jsonpath='{.status.containerStatuses[0].lastState.terminated.reason} exitCode={.status.containerStatuses[0].lastState.terminated.exitCode}'
   Completed exitCode=0
   ```
   A clean exit 0 is the app's own SIGTERM handler, so the kubelet stopped it; it did not crash.
2. What did the kubelet see?
   ```
   $ kubectl get events -n loantrack --field-selector type=Warning --sort-by=.lastTimestamp
   Warning Unhealthy pod/backend-85cf5cdb49-lv6tc   Liveness probe failed: Get "http://10.244.0.22:8080/healthz": context deadline exceeded (Client.Timeout exceeded while awaiting headers)
   Warning Unhealthy pod/backend-85cf5cdb49-vnplx   Liveness probe failed: Get "http://10.244.0.20:8080/healthz": context deadline exceeded ...
   Warning Unhealthy pod/frontend-66c5c74f4-rh6mc   Liveness probe failed: Get "http://10.244.0.11:8080/healthz": context deadline exceeded ...
   Warning Unhealthy pod/postgres-0                 Liveness probe failed: command timed out: "sh -c pg_isready ..." timed out after 5s
   ```
3. Every pod, including postgres, timed out within a few seconds of each other, so the
   cause was node-wide (minikube with 2 CPUs and 3000 MB inside a 3.5 GB Docker
   Desktop, while other Docker containers were being stopped), not the application.

**Root cause.** Backend and frontend liveness allowed 3 failures x 10s with a 2s
timeout, so roughly 30s of slowness restarted processes that were healthy. Postgres,
with 6 failures x 10s and a 5s timeout, survived the same stall, which confirmed the
thresholds were the problem.

**Fix.** Liveness on backend and frontend now uses `timeoutSeconds: 5` and
`failureThreshold: 6` (~60s before a restart). Readiness stays fast because it only
removes a pod from the Service and never restarts it. A full redeploy afterwards ran
with 0 restarts.

## 2. 502 Bad Gateway after the backend restarted (refused connection)

**Symptom.** Under Docker Compose, after `docker compose stop db`,
`docker compose restart backend` and `docker compose start db`, the backend logged
`[db] connected to db:5432 (attempt 3)` but the app returned:

```
$ curl -s -w " [%{http_code}]\n" localhost:8080/api/readyz
<html><head><title>502 Bad Gateway</title></head> ... nginx/1.27.3 ... [502]
```

**Diagnosis.**

```
$ docker compose logs frontend | grep upstream
[error] connect() failed (111: Connection refused) while connecting to upstream, ... upstream: "http://172.21.0.3:8080/readyz"
$ docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' loantrack-backend-1
172.21.0.2
$ docker compose exec frontend getent hosts backend
172.21.0.2        backend  backend
```

DNS already returned the backend's new IP (`.2`), but nginx still sent requests to the old one (`.3`).

**Root cause.** nginx resolves a hostname written directly in `proxy_pass` once, at
startup, and keeps that IP for the life of the process. The restarted backend
container came back with a different IP.

**Fix.** `resolver ${NGINX_LOCAL_RESOLVERS} valid=10s` (filled in by the nginx image
when `NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1`), plus
`set $backend_upstream http://${BACKEND_HOST}:${BACKEND_PORT}` and
`proxy_pass $backend_upstream`. A variable makes nginx resolve through the resolver at
request time; `rewrite ^/api/(.*)$ /$1 break` strips the prefix, which a variable
`proxy_pass` no longer does. Verified by forcing the backend onto a new IP with a
placeholder container:

```
backend IP: 172.21.0.2 -> 172.21.0.5
$ curl -s -w " [%{http_code}]\n" localhost:8080/api/readyz
{"status":"ready","pod":"8a5165b658cc"} [200]
```

Side effect handled on Kubernetes: nginx's resolver does not use resolv.conf search
domains, so `BACKEND_HOST` in the ConfigMap is `backend.loantrack.svc.cluster.local`.

## 3. Old rows came back after teardown and a fresh deploy (storage)

**Symptom.** After `./scripts/teardown.sh --yes` and `./scripts/deploy.sh`, the "empty"
database returned 8 rows instead of the 6 seed rows.

**Diagnosis.**

```
$ kubectl get pv -o custom-columns=NAME:.metadata.name,CLAIM:.spec.claimRef.name,NS:.spec.claimRef.namespace,RECLAIM:.spec.persistentVolumeReclaimPolicy,PATH:.spec.hostPath.path,STATUS:.status.phase
pvc-3a47a3e7-...   pgdata-postgres-0   loantrack   Delete   /tmp/hostpath-provisioner/loantrack/pgdata-postgres-0   Released
pvc-3b4aca2a-...   pgdata-postgres-0   loantrack   Delete   /tmp/hostpath-provisioner/loantrack/pgdata-postgres-0   Bound
$ kubectl get storageclass standard -o jsonpath='{.provisioner} reclaim={.reclaimPolicy}'
k8s.io/minikube-hostpath reclaim=Delete
```

The old volume was still `Released`, and the old and new volumes pointed at the same directory.

**Root cause.** minikube's hostpath provisioner names the directory after
`<namespace>/<pvc-name>`. Deleting the namespace left the old PV `Released` with its
data on disk; the new PVC with the same name got the same directory, so postgres found
a non-empty data directory, skipped the init scripts and served the old rows.

**Fix.** `teardown.sh` now deletes every PV whose `claimRef.namespace` is `loantrack`
and removes `/tmp/hostpath-provisioner/loantrack` with `minikube ssh`. Retest: a fresh
deploy returned 6 rows, and running teardown twice is a no-op.

## 4. The build-time config check was silently skipped (Docker/BuildKit)

**Symptom.** The frontend Dockerfile had a `config-check` stage running `nginx -t`, but
`docker build` printed no `nginx -t` output, so a broken config would not fail the build.

**Diagnosis.**

```
$ docker build --no-cache --progress=plain -t loantrack-frontend:1.0.0 frontend
#5 [runtime 1/3] FROM docker.io/nginxinc/nginx-unprivileged:1.27.3-alpine
#6 [runtime 2/3] COPY nginx/default.conf.template ...
#7 [runtime 3/3] COPY public/ /usr/share/nginx/html/
```

No `[config-check ...]` step ran at all.

**Root cause.** BuildKit only builds the stages the target stage depends on. The
runtime stage never referenced `config-check`, so it was pruned from the build graph.

**Fix.** `config-check` writes `/tmp/nginx-config-ok` after `nginx -t`, and the runtime
stage runs `COPY --from=config-check /tmp/nginx-config-ok /etc/nginx/config-validated`.
The rebuild shows `[config-check 3/3] ... test is successful`.

## Smaller ones

- **minikube would not start:** `X Exiting due to MK_USAGE: Docker Desktop has only 3582MB memory but you specified 4096MB`. Started with `--memory=3000` (configurable via `MINIKUBE_MEMORY` in `deploy.sh`).
- **CRLF line endings on Windows:** the first commit warned `LF will be replaced by CRLF`. Shell scripts with CRLF fail inside Linux containers (`/bin/sh^M: not found`), so `.gitattributes` forces `eol=lf`.
- **PR #1 merged into `main` instead of `develop`:** `main` was the default branch. Fixed without rewriting history (see BRANCHING.md).
- **"Port 5432 open" on the host:** a check suggested the Compose database was published. `Get-NetTCPConnection -LocalPort 5432` showed a locally installed `postgres.exe`, not Docker; `docker ps` showed `loantrack-db-1 5432/tcp` with no host binding.
