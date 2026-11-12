#!/usr/bin/env bash
# Remove everything LoanTrack created on minikube by deleting its namespace.
# That includes the PersistentVolumeClaim, i.e. ALL DATABASE DATA, so it asks
# for confirmation unless --yes is passed. Safe to run when nothing is deployed.
#
# Usage:   ./scripts/teardown.sh          (asks first)
#          ./scripts/teardown.sh --yes    (no prompt, e.g. before a clean deploy)
set -euo pipefail

NAMESPACE=loantrack

# Only ever act on minikube, never on another (possibly cloud) context.
kubectl config use-context minikube >/dev/null

if ! kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
  echo "Namespace $NAMESPACE does not exist; nothing to remove."
  exit 0
fi

if [ "${1:-}" != "--yes" ]; then
  read -r -p "Delete namespace '$NAMESPACE' and its database volume? [y/N] " answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *) echo "Aborted, nothing deleted."; exit 0 ;;
  esac
fi

# --wait blocks until every resource (pods, PVC, ...) is actually gone, so a
# deploy right after starts from a truly empty namespace.
kubectl delete namespace "$NAMESPACE" --wait=true
echo "Namespace $NAMESPACE deleted. Images stay loaded in minikube for the next deploy."
