#!/usr/bin/env bash
# One-command deploy of LoanTrack to minikube:
#   empty (or existing) minikube -> images built and loaded -> manifests applied
#   in order -> rollouts finished -> URL printed.
#
# Idempotent: every step either checks first or uses `kubectl apply`, so running
# it again changes nothing that is already in the desired state, and database
# data on the PVC is never touched.
#
# Usage:   ./scripts/deploy.sh
# Options (env vars): VERSION=1.0.0  MINIKUBE_CPUS=2  MINIKUBE_MEMORY=3000
set -euo pipefail   # stop on any error, unset variable or failed pipe

# Always run from the repository root, wherever the script is called from.
cd "$(dirname "$0")/.."

NAMESPACE=loantrack
VERSION="${VERSION:-1.0.0}"
MINIKUBE_CPUS="${MINIKUBE_CPUS:-2}"
MINIKUBE_MEMORY="${MINIKUBE_MEMORY:-3000}"   # MB; Docker Desktop must have more than this
TIERS=(db backend frontend)

log() { printf '\n==> %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

# --- 1. Prerequisites ----------------------------------------------------------
log "Checking prerequisites"
for cmd in docker minikube kubectl; do
  command -v "$cmd" >/dev/null 2>&1 || die "$cmd is not installed or not on PATH"
done
docker info >/dev/null 2>&1 || die "Docker is not running (start Docker Desktop)"
[ -f .env ] || die ".env not found. Run: cp .env.example .env  (and set real values)"

# Read only the two credentials from .env (no `source`, so nothing else is executed).
env_value() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2- | tr -d '\r'; }
POSTGRES_USER="$(env_value POSTGRES_USER)"
POSTGRES_PASSWORD="$(env_value POSTGRES_PASSWORD)"
[ -n "$POSTGRES_USER" ] && [ -n "$POSTGRES_PASSWORD" ] \
  || die "POSTGRES_USER and POSTGRES_PASSWORD must be set in .env"

# --- 2. Cluster ----------------------------------------------------------------
log "Ensuring minikube is running"
if minikube status --format '{{.Host}}' 2>/dev/null | grep -q Running; then
  echo "minikube already running"
else
  minikube start --driver=docker --cpus="$MINIKUBE_CPUS" --memory="$MINIKUBE_MEMORY"
fi
# Never deploy to whatever context happens to be current (could be a cloud cluster).
kubectl config use-context minikube >/dev/null
echo "kubectl context: $(kubectl config current-context)"

# --- 3. Images -----------------------------------------------------------------
# Build with the local Docker, then copy into minikube's container runtime.
# Manifests use imagePullPolicy: Never, so the cluster only uses these local images.
log "Building and loading images (tag $VERSION)"
for tier in "${TIERS[@]}"; do
  image="loantrack-$tier:$VERSION"
  docker build --quiet -t "$image" "./$tier" >/dev/null
  minikube image load "$image"
  echo "built and loaded $image"
done

# --- 4. Namespace and Secret ---------------------------------------------------
log "Applying namespace and database secret"
kubectl apply -f k8s/namespace.yaml
# `create --dry-run | apply` turns create into create-or-update (plain create
# fails if the Secret exists). Only the two credential keys go into the Secret.
kubectl create secret generic loantrack-db-secret -n "$NAMESPACE" \
  --from-literal=POSTGRES_USER="$POSTGRES_USER" \
  --from-literal=POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  --dry-run=client -o yaml | kubectl apply -f -

# --- 5. Workloads (order comes from k8s/kustomization.yaml) --------------------
log "Applying manifests"
kubectl apply -k k8s/

# --- 6. Wait for rollouts ------------------------------------------------------
log "Waiting for rollouts"
kubectl rollout status statefulset/postgres -n "$NAMESPACE" --timeout=180s
kubectl rollout status deployment/backend  -n "$NAMESPACE" --timeout=180s
kubectl rollout status deployment/frontend -n "$NAMESPACE" --timeout=120s

# --- 7. Result -----------------------------------------------------------------
log "Deployed"
kubectl get pods,svc -n "$NAMESPACE"

driver="$(minikube profile list -o json 2>/dev/null | grep -o '"Driver":"[^"]*"' | head -n1 | cut -d'"' -f4)"
os="$(uname -s)"
echo
if [ "$driver" = "docker" ] && [[ "$os" != Linux* ]]; then
  # Docker driver on Windows/macOS: the node IP is not routable from the host,
  # so minikube opens a tunnel that lives as long as this command runs.
  echo "Open the app (keep this command running, it prints the URL):"
  echo "  minikube service frontend -n $NAMESPACE --url"
else
  echo "App URL: http://$(minikube ip):30080"
fi
