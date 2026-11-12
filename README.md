# LoanTrack

![Docker](https://img.shields.io/badge/Docker-29.8-2496ED?logo=docker&logoColor=white)
![Kubernetes](https://img.shields.io/badge/Kubernetes-1.37-326CE5?logo=kubernetes&logoColor=white)
![minikube](https://img.shields.io/badge/minikube-1.39-F7931E?logo=kubernetes&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22-5FA04E?logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![nginx](https://img.shields.io/badge/nginx-1.27-009639?logo=nginx&logoColor=white)
![Release](https://img.shields.io/badge/release-v1.1.0-0f172a)

A three-tier loan tracker (static web frontend, Node.js API, PostgreSQL) that runs
under Docker Compose and on a local Kubernetes cluster (minikube), built with a
`main` / `develop` / `feature/*` Git workflow.

**Demo video:** _link added after recording_

> **Highlights**
> - **One command, idempotent:** `./scripts/deploy.sh` takes an empty minikube to a working app in about a minute; running it again changes nothing.
> - **Zero failed requests during a rolling update and rollback** (78/78 returned 200).
> - **Self-healing proven:** deleted pods are replaced, and database rows survive deleting the PostgreSQL pod.
> - **Secure by default:** every container runs as non-root, no credential in code, images or Git history, and the database is never exposed outside the cluster.
> - **4 real issues debugged and written up** in [ISSUES.md](ISSUES.md) (symptom, diagnosis, root cause, fix).

| Document | Contents |
|---|---|
| [EVIDENCE.md](EVIDENCE.md) | Commands and outputs for Parts B, C and D, plus UI screenshots |
| [ISSUES.md](ISSUES.md) | Real problems hit while building this: symptom, diagnosis, root cause, fix |
| [BRANCHING.md](BRANCHING.md) | Branching model used and whether I would recommend it |
| [AI_USAGE.md](AI_USAGE.md) | How AI tools were used and where they were wrong |

## Tool versions

| Tool | Version |
|---|---|
| Docker (Docker Desktop, Windows 11) | 29.8.1 |
| Docker Compose | v2 (bundled with Docker Desktop) |
| minikube | v1.39.0, docker driver, containerd 2.3.4 runtime |
| Kubernetes (minikube) | v1.37.0 |
| kubectl | v1.37.1 (Kustomize v5.8.1) |
| Backend runtime | Node.js 22.12.0 on Alpine 3.21 (Express 4, node-postgres 8) |
| Frontend | nginx 1.27.3 (`nginxinc/nginx-unprivileged`, Alpine) |
| Database | PostgreSQL 16.6 on Alpine 3.21 |

## Architecture

### Docker Compose

```mermaid
%%{init: {'theme':'base','flowchart':{'nodeSpacing':40,'rankSpacing':70,'padding':18},'themeVariables':{'fontSize':'19px','lineColor':'#64748b','clusterBkg':'#f8fafc','clusterBorder':'#94a3b8'}}}%%
flowchart LR
  user(["🌐 <b>Browser</b>"]):::client
  subgraph net["🐳 Docker network · loantrack"]
    direction LR
    fe["🖥️ <b>frontend</b><br/><small>nginx · :8080</small>"]:::web
    be["⚙️ <b>backend</b><br/><small>Node.js API · :8080</small>"]:::api
    db[("🐘 <b>db</b><br/><small>PostgreSQL · :5432</small>")]:::data
  end
  vol[("💾 <b>pgdata</b><br/><small>named volume</small>")]:::store
  user ==>|"localhost:8080"| fe
  fe ==>|"/api/*"| be
  be ==>|"pg pool"| db
  db -.- vol
  classDef client fill:#0f172a,stroke:#0f172a,color:#ffffff
  classDef web fill:#dbeafe,stroke:#2563eb,stroke-width:3px,color:#1e3a8a
  classDef api fill:#dcfce7,stroke:#16a34a,stroke-width:3px,color:#14532d
  classDef data fill:#ffedd5,stroke:#ea580c,stroke-width:3px,color:#7c2d12
  classDef store fill:#f1f5f9,stroke:#64748b,stroke-width:2px,stroke-dasharray:5 4,color:#334155
  linkStyle 0,1,2 stroke:#475569,stroke-width:3px
```

### Kubernetes (minikube)

```mermaid
%%{init: {'theme':'base','flowchart':{'nodeSpacing':30,'rankSpacing':45,'padding':16},'themeVariables':{'fontSize':'18px','lineColor':'#64748b','clusterBkg':'#faf5ff','clusterBorder':'#7c3aed'}}}%%
flowchart LR
  user(["🌐 <b>Browser</b><br/><small>minikube service</small>"]):::client
  subgraph ns["☸️ minikube · namespace loantrack"]
    direction LR
    subgraph t1["🖥️ Frontend tier"]
      direction TB
      fsvc{{"🔌 <b>Service</b><br/><small>NodePort 30080</small>"}}:::svc
      fe["<b>Deployment</b><br/><small>2 × nginx :8080</small>"]:::web
      fsvc ==> fe
    end
    subgraph t2["⚙️ API tier"]
      direction TB
      bsvc{{"🔌 <b>Service</b><br/><small>ClusterIP :8080</small>"}}:::svc
      be["<b>Deployment</b><br/><small>2 × Node.js :8080</small>"]:::api
      cfg["🔐 <b>ConfigMap + Secret</b><br/><small>env only</small>"]:::cfg
      bsvc ==> be
      cfg -.-> be
    end
    subgraph t3["🐘 Data tier"]
      direction TB
      psvc{{"🔌 <b>Service</b><br/><small>ClusterIP :5432</small>"}}:::svc
      db[("<b>StatefulSet</b><br/><small>postgres-0 :5432</small>")]:::data
      pvc[("💾 <b>PVC</b><br/><small>pgdata-postgres-0 · 1Gi</small>")]:::store
      psvc ==> db
      db -.- pvc
    end
  end
  user ==> t1
  t1 ==>|"/api/*"| t2
  t2 ==>|"pg pool"| t3
  classDef client fill:#0f172a,stroke:#0f172a,color:#ffffff
  classDef svc fill:#ede9fe,stroke:#7c3aed,stroke-width:3px,color:#4c1d95
  classDef web fill:#dbeafe,stroke:#2563eb,stroke-width:3px,color:#1e3a8a
  classDef api fill:#dcfce7,stroke:#16a34a,stroke-width:3px,color:#14532d
  classDef data fill:#ffedd5,stroke:#ea580c,stroke-width:3px,color:#7c2d12
  classDef store fill:#f1f5f9,stroke:#64748b,stroke-width:2px,stroke-dasharray:5 4,color:#334155
  classDef cfg fill:#f8fafc,stroke:#94a3b8,stroke-width:2px,stroke-dasharray:5 4,color:#334155
  style t1 fill:#eff6ff,stroke:#93c5fd,stroke-width:2px
  style t2 fill:#f0fdf4,stroke:#86efac,stroke-width:2px
  style t3 fill:#fff7ed,stroke:#fdba74,stroke-width:2px
  linkStyle 0,1,3,5,6,7 stroke:#475569,stroke-width:3px
```

### Request path

| Step | From → to | Docker Compose | Kubernetes | Port |
|---|---|---|---|---|
| 1 | Browser → frontend (nginx) | `http://localhost:8080` | `minikube service frontend -n loantrack --url` → NodePort `30080` | 8080 |
| 2 | frontend → backend | nginx proxies `/api/*` (prefix stripped) to `backend:8080` | to `backend.loantrack.svc.cluster.local:8080` (ClusterIP) | 8080 |
| 3 | backend → database | pg connection pool to `db:5432` | pg connection pool to `postgres:5432` (ClusterIP) | 5432 |
| 4 | database → disk | named volume `loantrack-pgdata` | PVC `pgdata-postgres-0` (1Gi) | – |

Traffic only flows in one direction: the browser talks to nginx, nginx to the API,
the API to PostgreSQL. **The frontend never touches the database**: it has no
driver, connection string or credential, only relative `/api/...` calls. Only the
frontend is reachable from outside; the backend and database are internal only.

## Run with Docker Compose

```bash
git clone https://github.com/Nitish0223/loantrack.git
cd loantrack
cp .env.example .env          # dummy values work locally; change the password if you like
docker compose up -d          # builds all three images on first run
```

Open **http://localhost:8080**. Then:

```bash
docker compose ps             # all three services "healthy"
docker compose logs backend   # pool connection and retry logs
docker compose down           # stop; the database volume is kept
docker compose down -v        # stop and delete the database volume (back to the 6 seed rows)
```

## Run on Kubernetes (minikube)

Prerequisites: Docker Desktop running, minikube and kubectl installed, `.env` created
(`cp .env.example .env`). From Git Bash on Windows, or any shell on macOS/Linux:

```bash
./scripts/deploy.sh
```

It starts minikube if needed, pins kubectl to the `minikube` context, builds the three
images and loads them into minikube, creates the database Secret from `.env`, applies
`k8s/` with Kustomize, waits for every rollout and prints how to open the app. It is
idempotent: running it again reports `unchanged` and keeps the database.

Open the frontend (exact command):

```bash
minikube service frontend -n loantrack --url
```

With the docker driver on Windows/macOS this command opens a tunnel and must stay
running; open the URL it prints. On Linux `http://$(minikube ip):30080` also works.

Remove everything, including the database volume (asks first, or pass `--yes`):

```bash
./scripts/teardown.sh
```

<details>
<summary>Manual steps (what deploy.sh does)</summary>

```bash
minikube start --driver=docker --cpus=2 --memory=3000
kubectl config use-context minikube
for t in db backend frontend; do docker build -t loantrack-$t:1.0.0 ./$t && minikube image load loantrack-$t:1.0.0; done
kubectl apply -f k8s/namespace.yaml
kubectl create secret generic loantrack-db-secret -n loantrack \
  --from-literal=POSTGRES_USER=loantrack --from-literal=POSTGRES_PASSWORD='<your password>' \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -k k8s/
kubectl rollout status statefulset/postgres -n loantrack
kubectl rollout status deployment/backend -n loantrack
kubectl rollout status deployment/frontend -n loantrack
```
</details>

### Creating the Secret (reviewers)

`k8s/secret.example.yaml` only shows the shape, with dummy values; it is not listed
in `kustomization.yaml` and is never applied. Create the real Secret either by running
`./scripts/deploy.sh` (reads `POSTGRES_USER` and `POSTGRES_PASSWORD` from `.env`), with
the `kubectl create secret ... --dry-run=client -o yaml | kubectl apply -f -` command
above, or by copying the example to `k8s/secret.yaml` (git-ignored), editing it and
running `kubectl apply -f k8s/secret.yaml`.

## Repository layout

```
backend/     Express API (src/), multi-stage Dockerfile, .dockerignore
frontend/    static page (public/), nginx config template, Dockerfile
db/          migrations/001_create_loans_table.sql, seed/002_seed_loans.sql, Dockerfile
k8s/         namespace, configmap, secret.example, postgres, backend, frontend, kustomization
scripts/     deploy.sh, teardown.sh
docker-compose.yml, .env.example
```

## Design decisions

- **Backend base image:** `node:22.12.0-alpine3.21`, an exact tag (never `latest`), small, ships the non-root `node` user and busybox `wget` for the HEALTHCHECK; the image is 230 MB, under the 300 MB limit. Distroless would be smaller but has no shell for the healthcheck or debugging.
- **Layer-cache boundary:** `package.json` and `package-lock.json` are copied and `npm ci --omit=dev` runs before `COPY src`, so a source change reuses the cached dependency layer (shown in EVIDENCE.md).
- **StatefulSet vs Deployment for Postgres:** StatefulSet with `volumeClaimTemplates`. `postgres-0` keeps a stable name and its own PVC that is re-attached whenever the pod is recreated. A Deployment + ReadWriteOnce PVC can deadlock on a rolling update (the new pod cannot mount the disk while the old one holds it).
- **Liveness vs readiness:** readiness (`/readyz`, checks the database) decides whether a pod receives traffic and fails fast (2 x 5s); liveness (`/healthz`, process only) decides whether to restart it and is tolerant (6 x 10s, 5s timeout). A database outage removes pods from the Service but never restarts them.
- **Memory vs CPU limit:** exceeding the memory limit gets the container OOMKilled (exit code 137) and restarted; exceeding the CPU limit only throttles it (it runs slower) and is never killed.
- **Secrets:** base64 in a Secret is encoding, not encryption: anyone who can read the Secret or etcd can decode it. In production I would enable etcd encryption at rest (KMS provider), restrict Secret access with RBAC, and source credentials from a secrets manager (Vault or AWS Secrets Manager via External Secrets Operator), or use Sealed Secrets/SOPS when they must live in Git.
- **Rolling updates:** `maxSurge: 1, maxUnavailable: 0` plus the readiness probe. A user hitting the app mid-rollout gets no errors (78/78 requests returned 200 during rollout and undo), but consecutive requests may be answered by the old or the new version until the rollout finishes.
- **nginx -> backend DNS:** nginx re-resolves the backend name through the container's DNS (`resolver` + variable `proxy_pass`), so a backend with a new IP is found without restarting nginx (see ISSUES.md). On Kubernetes the backend host is the fully-qualified Service name because nginx's resolver ignores search domains.
- **Plain YAML + Kustomize instead of Helm:** the assignment allows either, and plain manifests keep every value visible in the file a reviewer reads, with no `{{ .Values }}` templating in between, which also makes live debugging faster. Kustomize only lists the files in apply order. A Helm chart (or Kustomize overlays) pays off once there are several environments with different values; see the roadmap below.
- **Least privilege:** every container runs as non-root (`node`, `nginx`, `postgres`); backend and frontend drop all Linux capabilities and disallow privilege escalation; the backend root filesystem is read-only.

## Assumptions

- **Frontend multi-stage build:** the static frontend has nothing to compile, so its first stage is a build-time `nginx -t` check of the config template; the runtime stage copies a marker file from it so BuildKit cannot skip it.
- **Database Dockerfile:** "a Dockerfile per application tier" is read as including the database. The image bakes the migration and seed into `/docker-entrypoint-initdb.d` so Compose and Kubernetes apply the same SQL; it runs on first start only (empty data directory).
- **minikube memory:** Docker Desktop on the development laptop had 3.5 GB, so minikube runs with `--memory=3000` (configurable through `MINIKUBE_MEMORY`).
- **Images:** built locally and loaded with `minikube image load`; manifests use `imagePullPolicy: Never`, so no registry or registry credentials are involved.
- **Replicas:** the manifests declare 2 backend replicas; scaling to 3 in EVIDENCE.md was done with `kubectl scale`, and the next `kubectl apply` returns to the declared 2.
- **`statefulset.apps/postgres configured` on every deploy:** `kubectl diff -k k8s/` shows no difference and no pod restarts; it is a client-side apply quirk with `volumeClaimTemplates`.

## What I would do with more time

Not built in this assignment (it is scoped to a laptop with no cloud account);
this is how I would take LoanTrack to production.

```mermaid
%%{init: {'theme':'base','flowchart':{'nodeSpacing':30,'rankSpacing':45,'padding':16},'themeVariables':{'fontSize':'17px','lineColor':'#64748b','clusterBkg':'#f8fafc','clusterBorder':'#94a3b8'}}}%%
flowchart LR
  subgraph ci["🔁 CI · Jenkins"]
    direction TB
    gh["🐙 <b>GitHub</b><br/><small>PR merged to main</small>"]:::git
    jen["🛠️ <b>Jenkins</b><br/><small>Jenkinsfile + Groovy library</small>"]:::ci
    ecr[("📦 <b>Amazon ECR</b><br/><small>image tagged by SHA</small>")]:::aws
    gh --> jen --> ecr
  end
  subgraph cd["🚀 CD · GitOps"]
    direction TB
    chart["⎈ <b>Helm chart</b><br/><small>values per environment</small>"]:::cd
    argo["🔄 <b>Argo CD</b><br/><small>auto-sync + self-heal</small>"]:::cd
    chart --> argo
  end
  subgraph aws["☁️ AWS · Terraform-provisioned VPC"]
    direction TB
    r53["🌍 <b>Route 53</b><br/><small>loantrack.example.com</small>"]:::aws
    alb["⚖️ <b>ALB + ACM TLS</b><br/><small>Load Balancer Controller</small>"]:::aws
    eks["☸️ <b>EKS</b><br/><small>frontend + backend pods</small>"]:::k8s
    rds[("🐘 <b>RDS PostgreSQL</b><br/><small>Multi-AZ, private subnet</small>")]:::data
    r53 --> alb --> eks --> rds
  end
  ci ==>|"bumps image tag in values"| cd
  cd ==>|"deploys"| aws
  classDef git fill:#0f172a,stroke:#0f172a,color:#ffffff
  classDef ci fill:#dbeafe,stroke:#2563eb,stroke-width:2px,color:#1e3a8a
  classDef cd fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#4c1d95
  classDef aws fill:#ffedd5,stroke:#ea580c,stroke-width:2px,color:#7c2d12
  classDef k8s fill:#dcfce7,stroke:#16a34a,stroke-width:2px,color:#14532d
  classDef data fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#78350f
```

### CI: Jenkins

- **Why Jenkins over GitHub Actions:** pipeline steps live in a Groovy shared library that every service reuses, agents run self-hosted inside the VPC so they reach ECR and the cluster through an IAM role with no stored keys, and it is the CI tool many enterprise teams already standardise on.
- **Trigger:** a GitHub webhook starts a multibranch pipeline, so pull requests get the same checks as merges.
- **Pipeline stages (declarative `Jenkinsfile`):** checkout, lint and unit tests, `docker build`, Trivy image scan (fails on HIGH/CRITICAL), `kubeconform` / `helm lint`, push to ECR tagged with the commit SHA, then update `image.tag` in the Helm chart's values in Git.

### CD: GitOps with Argo CD and Helm

- The Kubernetes manifests become a **Helm chart** (`charts/loantrack`) with one values file per environment (`values-dev.yaml`, `values-staging.yaml`, `values-prod.yaml`) for replicas, resources, image tags and hostnames.
- **Argo CD watches the Helm chart in Git**, renders it with the environment's values and syncs it to EKS with auto-sync, self-heal (manual `kubectl` drift is reverted) and pruning.
- A release is a Git commit that changes `image.tag`; a rollback is `git revert`, so every change to production is reviewed and auditable.

### AWS: EKS, IAM, load balancer and DNS

- **Terraform** for everything: a VPC across 2-3 Availability Zones with public subnets (load balancer) and private subnets (nodes, database), NAT gateways, an **EKS** cluster with managed node groups, and **ECR** repositories.
- **IAM, least privilege:** IRSA (IAM roles for service accounts) so each pod gets only the AWS permissions it needs (the Load Balancer Controller, external-dns, External Secrets); Jenkins agents use an **IAM role** (instance profile or IRSA), so there are no long-lived access keys; cluster access through EKS access entries mapped to IAM roles.
- **Load balancer and DNS:** the **AWS Load Balancer Controller** turns a Kubernetes Ingress into an **ALB** with a TLS certificate from **ACM** (HTTP redirected to HTTPS), optionally behind AWS WAF; **external-dns** creates the **Route 53** record (for example `loantrack.example.com`) pointing at the ALB.
- **Database:** **Amazon RDS for PostgreSQL** (Multi-AZ, automated backups, private subnet, reachable only from the node security group) instead of PostgreSQL in the cluster.
- **Secrets:** credentials in **AWS Secrets Manager**, synced into Kubernetes Secrets by External Secrets Operator; EKS envelope encryption of Secrets with KMS.

### Reliability and observability

- HorizontalPodAutoscaler for the backend (CPU target, min 2 / max 5) and a PodDisruptionBudget so node upgrades never take all replicas down.
- NetworkPolicy so only backend pods can reach the database.
- Prometheus, Grafana and Alertmanager (kube-prometheus-stack) for request rate, latency, error rate and pod restarts, with alerts routed to email or Slack.
