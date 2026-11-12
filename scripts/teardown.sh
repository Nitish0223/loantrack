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

if [ "${1:-}" != "--yes" ]; then
  read -r -p "Delete namespace '$NAMESPACE' and its database volume? [y/N] " answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *) echo "Aborted, nothing deleted."; exit 0 ;;
  esac
fi

# --wait blocks until every namespaced resource (pods, PVC, ...) is gone.
# --ignore-not-found makes a second run a no-op instead of an error.
kubectl delete namespace "$NAMESPACE" --wait=true --ignore-not-found

# minikube's hostpath provisioner stores volumes under
# /tmp/hostpath-provisioner/<namespace>/<pvc-name>. Deleting the PVC can leave
# the PersistentVolume "Released" and the directory on disk, and a new PVC
# with the same name reuses that directory, bringing old rows back. Remove
# both so the next deploy really starts from an empty database.
for pv in $(kubectl get pv -o jsonpath="{range .items[?(@.spec.claimRef.namespace==\"$NAMESPACE\")]}{.metadata.name}{\" \"}{end}"); do
  kubectl delete pv "$pv" --ignore-not-found
done
minikube ssh -- sudo rm -rf "/tmp/hostpath-provisioner/$NAMESPACE"

echo "Namespace $NAMESPACE and its volumes deleted. Images stay loaded in minikube for the next deploy."
