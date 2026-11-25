# Helm – Important Commands Cheat Sheet

## 1. Helm Version

Check the installed Helm version.

```
helm version
helm version --short
```

## 2. Helm Repository Commands

Add a Helm repository:

```
helm repo add bitnami https://charts.bitnami.com/bitnami
```

List repositories:

```
helm repo list
```

Update repository information:

```
helm repo update
```

Remove a repository:

```
helm repo remove bitnami
```

Search charts:

```
helm search repo nginx
helm search hub nginx
```

## 3. Helm Install Commands

Install a chart:

```
helm install auth-service ./auth-service
```

Install into a specific namespace:

```
helm install auth-service ./auth-service \
  --namespace micro-app-test \
  --create-namespace
```

Install using an environment-specific values file:

```
helm install auth-service . \
  --namespace micro-app-test \
  -f values-test.yaml
```

Install or upgrade if the release already exists:

```
helm upgrade --install auth-service . \
  --namespace micro-app-test \
  -f values-test.yaml
```

## 4. Helm List Commands

List releases in the current namespace:

```
helm list
```

List releases in a specific namespace:

```
helm list -n micro-app-test
```

List releases across all namespaces:

```
helm list -A
```

List all releases, including uninstalled and failed releases:

```
helm list -A --all
```

## 5. Helm Upgrade Commands

Upgrade an existing release:

```
helm upgrade auth-service . \
  --namespace micro-app-test \
  -f values-test.yaml
```

Upgrade or install:

```
helm upgrade --install auth-service . \
  --namespace micro-app-test \
  -f values-test.yaml
```

Upgrade with an additional values file:

```
helm upgrade --install auth-service . \
  -n micro-app-test \
  -f values.yaml \
  -f values-test.yaml
```

Set a value directly:

```
helm upgrade auth-service . \
  -n micro-app-test \
  --set replicaCount=2
```

## 6. Helm Uninstall / Delete Commands

Uninstall a release:

```
helm uninstall auth-service \
  --namespace micro-app-test
```

Alternative command:

```
helm delete auth-service -n micro-app-test
```

Verify release deletion:

```
helm list -n micro-app-test
```

**Important:** Uninstalling a Helm release does not automatically delete its namespace or external database data. Persistent volumes and PVCs may also need separate inspection.

## 7. Helm Revision and History Commands

List the revision history of a release:

```
helm history auth-service \
  --namespace micro-app-test
```

Check release status:

```
helm status auth-service \
  --namespace micro-app-test
```

Example revision history:

| Revision | Description                       |
| -------- | --------------------------------- |
| 1        | Initial installation              |
| 2        | Updated image version             |
| 3        | Updated replica count             |
| 4        | Updated application configuration |

Each successful upgrade generally creates a new revision.

## 8. Helm Rollback Commands

Rollback to the previous revision:

```
helm rollback auth-service 0 \
  --namespace micro-app-test
```

Rollback to a specific revision:

```
helm rollback auth-service 2 \
  --namespace micro-app-test
```

Verify rollback:

```
helm history auth-service -n micro-app-test
helm status auth-service -n micro-app-test
```

**Note:** Revision `0` means the previous revision. A rollback creates a new revision; it does not erase the existing history.

## 9. Helm Get Commands

Get release values:

```
helm get values auth-service -n micro-app-test
```

Get all computed values:

```
helm get values auth-service \
  -n micro-app-test \
  --all
```

Get release manifest:

```
helm get manifest auth-service -n micro-app-test
```

Get release notes:

```
helm get notes auth-service -n micro-app-test
```

## 10. Helm Chart Validation Commands

Validate chart syntax:

```
helm lint .
```

Render Kubernetes manifests locally:

```
helm template auth-service . \
  -n micro-app-test \
  -f values-test.yaml
```

Render manifests and save output:

```
helm template auth-service . \
  -n micro-app-test \
  -f values-test.yaml > rendered.yaml
```

Perform a server-side dry run:

```
helm upgrade --install auth-service . \
  -n micro-app-test \
  -f values-test.yaml \
  --dry-run=server
```

## 11. Helm Chart Package Commands

Package a chart:

```
helm package ./auth-service
```

Show chart information:

```
helm show chart ./auth-service
```

Show chart values:

```
helm show values ./auth-service
```

List chart dependencies:

```
helm dependency list .
```

Download chart dependencies:

```
helm dependency update .
```

## 12. Useful Troubleshooting Commands

Check release status:

```
helm status auth-service -n micro-app-test
```

Check release history:

```
helm history auth-service -n micro-app-test
```

Check Kubernetes resources:

```
kubectl get all -n micro-app-test
```

Check Pods:

```
kubectl get pods -n micro-app-test -o wide
```

Describe a Pod:

```
kubectl describe pod <pod-name> -n micro-app-test
```

Check application logs:

```
kubectl logs <pod-name> -n micro-app-test
```

Check previous container logs:

```
kubectl logs <pod-name> -n micro-app-test --previous
```

---

## 13. Practical Example – Micro_App_Doc Test Environment

Navigate to the Helm chart directory:

```
cd ~/Micro_App_Doc/helm/auth-service
```

Install or upgrade Auth Service:

```
helm upgrade --install auth-service . \
  --namespace micro-app-test \
  -f values-test.yaml
```

Verify installation:

```
helm list -n micro-app-test

helm status auth-service -n micro-app-test

kubectl get pods -n micro-app-test
```

Check revision history:

```
helm history auth-service -n micro-app-test
```

Rollback to revision 1:

```
helm rollback auth-service 1 \
  --namespace micro-app-test
```

Uninstall Auth Service:

```
helm uninstall auth-service \
  --namespace micro-app-test
```

## 14. Most Important Commands – Quick Reference

| Operation           | Command                  |
| ------------------- | ------------------------ |
| Install             | `helm install`           |
| Upgrade             | `helm upgrade`           |
| Install or Upgrade  | `helm upgrade --install` |
| Uninstall           | `helm uninstall`         |
| List releases       | `helm list`              |
| List all namespaces | `helm list -A`           |
| Release status      | `helm status`            |
| Revision history    | `helm history`           |
| Rollback            | `helm rollback`          |
| Get values          | `helm get values`        |
| Get manifest        | `helm get manifest`      |
| Validate chart      | `helm lint`              |
| Render templates    | `helm template`          |
| Package chart       | `helm package`           |

**Remember these four commands for daily Helm operations:**

```
# 1. Install / Upgrade
helm upgrade --install auth-service . -n micro-app-test -f values-test.yaml

# 2. List
helm list -A

# 3. Revision History
helm history auth-service -n micro-app-test

# 4. Rollback
helm rollback auth-service 1 -n micro-app-test
```

**Recommendation:** Keep this README in your `Micro_App_Doc/helm/` directory as a common Helm command reference for your Dev, Test, QA, Stage, and Prod deployments.
