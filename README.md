# Micro_App_Doc – Microservices on Kubernetes with Helm

A practical microservices project that moves a Docker Compose application into Kubernetes and manages each application component with an independent Helm chart. PostgreSQL is hosted outside Kubernetes on dedicated Ubuntu VMs, while Kubernetes stores environment-specific database connection settings in ConfigMaps and credentials in Secrets.

This README describes the current Dev, Test and QA design, the project structure, prerequisites, deployment commands, verification steps and known items that still need attention.

## 1. Project overview

The application contains four components:

| Component | Container port | Kubernetes Service | Purpose |
|---|---:|---|---|
| Frontend | 80 | `frontend` | Web user interface |
| Auth Service | 8080 | `auth-service` | Authentication API |
| User Service | 8081 | `user-service` | User API |
| Item Service | 8082 | `item-service` | Item API |

Each component has its own Helm chart. The same chart is installed separately into Dev, Test and QA using an environment-specific values file.

PostgreSQL is not installed by the application Helm charts. The PostgreSQL servers, databases and users are provisioned separately. Helm creates Kubernetes ConfigMaps containing JDBC URLs; the application charts reference those ConfigMaps and the existing Kubernetes Secrets for database credentials.

### High-level architecture

```text
                         Windows host / browser
                                  |
                        VirtualBox host-only network
                                  |
                          Kubernetes cluster
                                  |
                 +----------------+----------------+
                 |                |                |
                Dev              Test              QA
           micro-app-dev    micro-app-test    micro-app-qa
                 |                |                |
           +-----+------+   +-----+------+   +-----+------+
           |            |   |            |   |            |
        Frontend     APIs Frontend     APIs Frontend     APIs
           |            |   |            |   |            |
           +------------+---+------------+---+------------+
                                  |
                      External PostgreSQL server
                         testdb: 192.168.56.14:5432
                                  |
                   Dev, Test and QA databases/users
```

**Frontend/API routing note:** a NodePort makes the Frontend reachable from a client, but does not automatically route browser API requests to the backend services. Browser-facing API paths, Ingress or a reverse proxy still need to be configured and tested. A browser cannot normally resolve Kubernetes-only service names such as `auth-service` directly.

## 2. Lab environment

### Kubernetes cluster

| Node | Role | Host-only IP | Operating system |
|---|---|---|---|
| `master` | Control plane | `192.168.56.10` | Ubuntu 22.04.5 LTS |
| `worker1` | Worker | `192.168.56.11` | Ubuntu 22.04.5 LTS |
| `worker2` | Worker | `192.168.56.12` | Ubuntu 22.04.5 LTS |
| `worker3` | Worker | `192.168.56.13` | Ubuntu 22.04.5 LTS |

Versions recorded during implementation:

- Kubernetes: `v1.36.6`
- Container runtime: `containerd 2.4.2`
- Helm: `v4.3.0`
- CNI: Calico

Check the live versions and node status rather than assuming these values have not changed:

```bash
kubectl version
kubectl get nodes -o wide
helm version --short
```

### PostgreSQL servers

| Server | IP and port | Intended use |
|---|---|---|
| `testdb` | `192.168.56.14:5432` | Dev, Test and QA |
| `proddb` | `192.168.56.15:5432` | Reserved for future Stage and Production work |

The current Dev/Test/QA Helm configuration points to `testdb` (`192.168.56.14`). The `proddb` server is not part of the current three-environment deployment described here.

The PostgreSQL services are managed separately using Docker Compose on their database VMs. The `external-postgres` Helm chart does **not** install PostgreSQL, create databases, create database users or manage PostgreSQL data directories.

## 3. Environment and database design

### Namespaces and databases

| Environment | Kubernetes namespace | Database user | Auth database | User database | Item database |
|---|---|---|---|---|---|
| Dev | `micro-app-dev` | `dev_app` | `dev_auth_db` | `dev_user_db` | `dev_item_db` |
| Test | `micro-app-test` | `test_app` | `test_auth_db` | `test_user_db` | `test_item_db` |
| QA | `micro-app-qa` | `qa_app` | `qa_auth_db` | `qa_user_db` | `qa_item_db` |

All three environments use `192.168.56.14:5432`. Each environment must have its own database user and its own databases. Grant each user only the privileges required by its environment's databases.

### Kubernetes Secrets

The existing Secrets are created separately in each namespace:

| Namespace | Secret |
|---|---|
| `micro-app-dev` | `dev-db-secret` |
| `micro-app-test` | `test-db-secret` |
| `micro-app-qa` | `qa-db-secret` |

Each Secret has these keys:

```text
DB_HOST
DB_PORT
DB_NAME
DB_USERNAME
DB_PASSWORD
```

`DB_NAME` in these Secrets currently represents the environment's Item database. The three microservices do not all use that single value. Their JDBC URLs come from three different ConfigMaps, one per service.

Check Secret names and key names without printing secret values:

```bash
kubectl get secrets -n micro-app-dev
kubectl get secrets -n micro-app-test
kubectl get secrets -n micro-app-qa

kubectl get secret dev-db-secret -n micro-app-dev \
  -o go-template='{{range $k, $v := .data}}{{printf "%s\\n" $k}}{{end}}'
```

### Creating or recreating a Secret

Only run these commands if the relevant Secret does not already exist. Replace the placeholders locally with the real values; do not commit real passwords to Git.

```bash
kubectl create secret generic dev-db-secret \
  --namespace micro-app-dev \
  --from-literal=DB_HOST=192.168.56.14 \
  --from-literal=DB_PORT=5432 \
  --from-literal=DB_NAME=dev_item_db \
  --from-literal=DB_USERNAME=dev_app \
  --from-literal=DB_PASSWORD='<DEV_DATABASE_PASSWORD>'
```

Use the corresponding values and Secret names for Test and QA. If a Secret already exists, do not blindly recreate it; first decide whether its values need to be updated. Remember that Kubernetes Secret values are base64-encoded in the API representation; base64 is not encryption. Restrict RBAC access and configure encryption at rest or an external secret manager for a hardened environment.

## 4. Repository layout

The main project layout is:

```text
Micro_App_Doc/
├── README.md
├── docker-compose.yml
├── database/
│   └── dev-pv.yaml
├── kubernetes/
│   ├── auth-service/
│   │   ├── deployment.yaml
│   │   └── service.yaml
│   ├── user-service/
│   │   ├── deployment.yaml
│   │   └── service.yaml
│   ├── item-service/
│   │   ├── deployment.yaml
│   │   └── service.yaml
│   ├── frontend/
│   │   ├── deployment.yaml
│   │   └── service.yaml
│   └── database/
│       ├── postgres-configmap.yaml
│       ├── postgres-headless-service.yaml
│       ├── postgres-pv.yaml
│       ├── postgres-secret.yaml
│       ├── postgres-service.yaml
│       ├── postgres-statefulset.yaml
│       └── storageclass.yaml
└── helm/
    ├── external-postgres/
    │   ├── Chart.yaml
    │   ├── values.yaml
    │   ├── values-dev.yaml
    │   ├── values-test.yaml
    │   ├── values-qa.yaml
    │   └── templates/
    │       ├── NOTES.txt
    │       ├── _helpers.tpl
    │       ├── auth-configmap.yaml
    │       ├── user-configmap.yaml
    │       └── item-configmap.yaml
    ├── auth-service/
    │   ├── Chart.yaml
    │   ├── values.yaml
    │   ├── values-dev.yaml
    │   ├── values-test.yaml
    │   ├── values-qa.yaml
    │   └── templates/
    │       ├── _helpers.tpl
    │       ├── deployment.yaml
    │       └── service.yaml
    ├── user-service/
    │   ├── Chart.yaml
    │   ├── values.yaml
    │   ├── values-dev.yaml
    │   ├── values-test.yaml
    │   ├── values-qa.yaml
    │   └── templates/
    │       ├── _helpers.tpl
    │       ├── deployment.yaml
    │       └── service.yaml
    ├── item-service/
    │   ├── Chart.yaml
    │   ├── values.yaml
    │   ├── values-dev.yaml
    │   ├── values-test.yaml
    │   ├── values-qa.yaml
    │   └── templates/
    │       ├── _helpers.tpl
    │       ├── deployment.yaml
    │       └── service.yaml
    └── frontend/
        ├── Chart.yaml
        ├── values.yaml
        ├── values-dev.yaml
        ├── values-test.yaml
        ├── values-qa.yaml
        └── templates/
            ├── _helpers.tpl
            ├── deployment.yaml
            └── service.yaml
```

The `kubernetes/` directory contains the original/raw manifests. The `helm/` directory contains the reusable charts used for the environment deployments. Do not apply the old and new manifests to the same namespace indiscriminately; use the Helm-managed releases as the source of truth for the new environment namespaces.

## 5. What each Helm chart manages

### `external-postgres`

This chart creates three ConfigMaps in each target namespace:

| ConfigMap | Key | Purpose |
|---|---|---|
| `external-postgres-auth` | `SPRING_DATASOURCE_URL` | Auth database JDBC URL |
| `external-postgres-user` | `SPRING_DATASOURCE_URL` | User database JDBC URL |
| `external-postgres-item` | `SPRING_DATASOURCE_URL` | Item database JDBC URL |

Example Dev URLs:

```text
Auth: jdbc:postgresql://192.168.56.14:5432/dev_auth_db
User: jdbc:postgresql://192.168.56.14:5432/dev_user_db
Item: jdbc:postgresql://192.168.56.14:5432/dev_item_db
```

The chart references an existing database Secret in its notes/values configuration, but it does not create or rotate that Secret.

### Application charts

Each application has an independent Helm chart and release:

| Chart / release | Image | Container port | Database ConfigMap |
|---|---|---:|---|
| `auth-service` | `kartikeyasoft/auth-service:latest` | 8080 | `external-postgres-auth` |
| `user-service` | `kartikeyasoft/user-service:latest` | 8081 | `external-postgres-user` |
| `item-service` | `kartikeyasoft/item-service:latest` | 8082 | `external-postgres-item` |
| `frontend` | `kartikeyasoft/frontend:latest` | 80 | Not currently configured with a database |

The Auth, User and Item Deployments read their JDBC URL from their service-specific ConfigMap. They read `DB_USERNAME` and `DB_PASSWORD` from the namespace's existing environment Secret and expose them to Spring Boot as `SPRING_DATASOURCE_USERNAME` and `SPRING_DATASOURCE_PASSWORD`.

The Frontend chart manages its Deployment and Service. It does not currently configure backend API URLs; browser-to-backend routing needs its own validation/configuration.

## 6. Prerequisites

Before deployment, confirm:

1. Kubernetes nodes are Ready.
2. Helm is installed and the current context points to the intended cluster.
3. The three namespaces exist.
4. PostgreSQL is running on `192.168.56.14:5432` and accepts connections from the Kubernetes nodes/Pods.
5. The nine Dev/Test/QA databases and three database users exist, with appropriate grants.
6. The three Kubernetes Secrets exist in their corresponding namespaces and contain the correct credentials.
7. The application Docker images are available from the configured registry.
8. The selected NodePorts are unused before deploying the Frontend.

Initial checks:

```bash
kubectl config current-context
kubectl get nodes -o wide
kubectl get namespaces
helm version --short
```

Check that the external PostgreSQL VM is reachable from a Kubernetes node. For example, from a worker VM:

```bash
nc -vz 192.168.56.14 5432
```

A successful TCP test verifies network reachability only; it does not verify database credentials. Use the PostgreSQL client test in the verification section for authentication.

## 7. Deployment order

Deploy the external database connection ConfigMaps first, then the backend services, then the Frontend.

Run commands from the Kubernetes master node. The examples assume the repository is at `~/Micro_App_Doc`.

### Step 1 – Deploy external PostgreSQL ConfigMaps

```bash
cd ~/Micro_App_Doc/helm/external-postgres

# Dev
helm upgrade --install external-postgres . \
  --namespace micro-app-dev \
  -f values-dev.yaml

# Test
helm upgrade --install external-postgres . \
  --namespace micro-app-test \
  -f values-test.yaml

# QA
helm upgrade --install external-postgres . \
  --namespace micro-app-qa \
  -f values-qa.yaml
```

Verify the ConfigMaps:

```bash
kubectl get configmaps -n micro-app-dev
kubectl get configmaps -n micro-app-test
kubectl get configmaps -n micro-app-qa
```

### Step 2 – Deploy Auth Service

```bash
cd ~/Micro_App_Doc/helm/auth-service

helm upgrade --install auth-service . \
  --namespace micro-app-dev -f values-dev.yaml

helm upgrade --install auth-service . \
  --namespace micro-app-test -f values-test.yaml

helm upgrade --install auth-service . \
  --namespace micro-app-qa -f values-qa.yaml
```

### Step 3 – Deploy User Service

```bash
cd ~/Micro_App_Doc/helm/user-service

helm upgrade --install user-service . \
  --namespace micro-app-dev -f values-dev.yaml

helm upgrade --install user-service . \
  --namespace micro-app-test -f values-test.yaml

helm upgrade --install user-service . \
  --namespace micro-app-qa -f values-qa.yaml
```

### Step 4 – Deploy Item Service

```bash
cd ~/Micro_App_Doc/helm/item-service

helm upgrade --install item-service . \
  --namespace micro-app-dev -f values-dev.yaml

helm upgrade --install item-service . \
  --namespace micro-app-test -f values-test.yaml

helm upgrade --install item-service . \
  --namespace micro-app-qa -f values-qa.yaml
```

### Step 5 – Deploy Frontend

The Frontend values files configure these NodePorts:

| Environment | NodePort |
|---|---:|
| Dev | 30080 |
| Test | 30081 |
| QA | 30082 |

First check for conflicts. NodePorts are cluster-wide, not namespace-local:

```bash
kubectl get services -A \
  -o custom-columns='NAMESPACE:.metadata.namespace,NAME:.metadata.name,TYPE:.spec.type,NODEPORTS:.spec.ports[*].nodePort'
```

If the ports are free, deploy:

```bash
cd ~/Micro_App_Doc/helm/frontend

helm upgrade --install frontend . \
  --namespace micro-app-dev -f values-dev.yaml

helm upgrade --install frontend . \
  --namespace micro-app-test -f values-test.yaml

helm upgrade --install frontend . \
  --namespace micro-app-qa -f values-qa.yaml
```

If a NodePort is already allocated, choose another unused port within the cluster's configured NodePort range and update that environment's values file before installation.

## 8. Frontend access and API routing

If the Frontend Pods and NodePort Services are healthy and the VirtualBox host-only network/firewall permits access, the intended URLs are:

| Environment | URL |
|---|---|
| Dev | `http://192.168.56.10:30080` |
| Test | `http://192.168.56.10:30081` |
| QA | `http://192.168.56.10:30082` |

A NodePort exposes the Frontend Service. It does not by itself configure API routing. Before declaring an environment fully working, open the browser developer tools and inspect the Network tab while using the application. Confirm the API URLs the browser requests and route them through an Ingress or reverse proxy, or configure the frontend build with the correct environment-specific public API base URL.

Do not put Kubernetes-only DNS names directly into browser-side code unless the browser has a DNS/network route that can resolve them. Kubernetes service names such as `auth-service`, `user-service` and `item-service` are intended for in-cluster communication.

## 9. Verify deployments

### Check Helm releases

```bash
helm list -n micro-app-dev
helm list -n micro-app-test
helm list -n micro-app-qa
```

Each completed environment should contain these releases:

```text
external-postgres
 auth-service
 user-service
 item-service
 frontend
```

(The leading spaces above are only for readability; Helm displays the release names in a table.)

### Check Deployments, Pods and Services

```bash
kubectl get deployments,pods,services -n micro-app-dev
kubectl get deployments,pods,services -n micro-app-test
kubectl get deployments,pods,services -n micro-app-qa
```

Check a specific rollout:

```bash
kubectl rollout status deployment/auth-service -n micro-app-dev --timeout=180s
kubectl rollout status deployment/user-service -n micro-app-dev --timeout=180s
kubectl rollout status deployment/item-service -n micro-app-dev --timeout=180s
kubectl rollout status deployment/frontend -n micro-app-dev --timeout=180s
```

Repeat with the Test or QA namespace as appropriate.

### Check application logs

```bash
kubectl logs deployment/auth-service -n micro-app-dev --tail=100
kubectl logs deployment/user-service -n micro-app-dev --tail=100
kubectl logs deployment/item-service -n micro-app-dev --tail=100
kubectl logs deployment/frontend -n micro-app-dev --tail=100
```

For a restarting container, inspect the previous instance:

```bash
kubectl logs deployment/item-service -n micro-app-qa --previous --tail=200
```

### Check backend EndpointSlices

```bash
kubectl get endpointslice -n micro-app-dev \
  -l kubernetes.io/service-name=auth-service

kubectl get endpointslice -n micro-app-dev \
  -l kubernetes.io/service-name=user-service

kubectl get endpointslice -n micro-app-dev \
  -l kubernetes.io/service-name=item-service
```

Repeat for Test and QA. Each Service should have a ready endpoint on its expected application port.

### Check Frontend Service and EndpointSlice

```bash
kubectl get service frontend -n micro-app-dev -o wide
kubectl get endpointslice -n micro-app-dev \
  -l kubernetes.io/service-name=frontend
```

Expected Dev Service port mapping is `80:30080/TCP`; Test is `80:30081/TCP`; QA is `80:30082/TCP`.

## 10. Verify PostgreSQL connectivity from Kubernetes

A successful Helm release or a Running Pod alone is not sufficient proof that database authentication works. Test from a temporary Pod using the environment's Secret.

Example for Dev. Create `/tmp/dev-db-test.yaml`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: dev-db-connectivity-test
  namespace: micro-app-dev
spec:
  restartPolicy: Never
  containers:
    - name: postgres-client
      image: postgres:16
      command: ["/bin/sh", "-c"]
      args:
        - |
          set -eu
          for db in dev_auth_db dev_user_db dev_item_db; do
            echo "Testing database: $db"
            PGPASSWORD="$DB_PASSWORD" psql \
              --host="$DB_HOST" \
              --port="$DB_PORT" \
              --username="$DB_USERNAME" \
              --dbname="$db" \
              --no-password \
              --set=ON_ERROR_STOP=1 \
              --command="SELECT current_database(), current_user;"
          done
      envFrom:
        - secretRef:
            name: dev-db-secret
```

Run and inspect:

```bash
kubectl apply -f /tmp/dev-db-test.yaml
kubectl get pod dev-db-connectivity-test -n micro-app-dev -w
# When it reaches Completed, press Ctrl+C.
kubectl logs dev-db-connectivity-test -n micro-app-dev
```

The results should show the three Dev database names and the `dev_app` user. Remove the temporary resources:

```bash
kubectl delete pod dev-db-connectivity-test -n micro-app-dev
rm -f /tmp/dev-db-test.yaml
```

For Test, use namespace `micro-app-test`, Secret `test-db-secret`, and database names `test_auth_db`, `test_user_db`, `test_item_db`. For QA, use namespace `micro-app-qa`, Secret `qa-db-secret`, and database names `qa_auth_db`, `qa_user_db`, `qa_item_db`.

## 11. Spring Boot database configuration

The Auth, User and Item applications should read the environment variables injected by their Kubernetes Deployments. A typical `application.properties` configuration is:

```properties
spring.datasource.url=${SPRING_DATASOURCE_URL}
spring.datasource.username=${SPRING_DATASOURCE_USERNAME}
spring.datasource.password=${SPRING_DATASOURCE_PASSWORD}
spring.datasource.driver-class-name=org.postgresql.Driver
spring.jpa.hibernate.ddl-auto=${SPRING_JPA_HIBERNATE_DDL_AUTO:update}
```

Do not hardcode environment database addresses or passwords into the application image. If you choose to set `spring.jpa.open-in-view=false`, test the application behavior because it changes when lazy database relationships may be accessed. The `PostgreSQLDialect` setting normally does not need to be specified explicitly when Hibernate can detect PostgreSQL from the JDBC connection.

## 12. Helm operations

### List releases

```bash
helm list -n micro-app-dev
helm list -n micro-app-test
helm list -n micro-app-qa
```

### Inspect a release

```bash
helm status auth-service -n micro-app-dev
helm status user-service -n micro-app-dev
helm status item-service -n micro-app-dev
helm status frontend -n micro-app-dev
helm status external-postgres -n micro-app-dev
```

### Lint and render before installing

Run `helm lint` from each chart directory:

```bash
helm lint ~/Micro_App_Doc/helm/external-postgres
helm lint ~/Micro_App_Doc/helm/auth-service
helm lint ~/Micro_App_Doc/helm/user-service
helm lint ~/Micro_App_Doc/helm/item-service
helm lint ~/Micro_App_Doc/helm/frontend
```

Render a chart without applying it:

```bash
helm template auth-service ~/Micro_App_Doc/helm/auth-service \
  --namespace micro-app-dev \
  -f ~/Micro_App_Doc/helm/auth-service/values-dev.yaml
```

Change the chart path, release name, namespace and values file for other components and environments.

### Upgrade a release

Use `helm upgrade --install` for repeatable installation/upgrade:

```bash
cd ~/Micro_App_Doc/helm/auth-service
helm upgrade --install auth-service . \
  --namespace micro-app-dev -f values-dev.yaml
```

### View revision history and roll back

```bash
helm history auth-service -n micro-app-dev
helm rollback auth-service <REVISION> -n micro-app-dev
```

Use the revision number shown by `helm history`. Rollbacks are independent per release and namespace.

## 13. Troubleshooting guide

### `ImagePullBackOff` or `ErrImagePull`

```bash
kubectl describe pod <POD_NAME> -n <NAMESPACE>
```

Check the image name/tag, registry availability, image pull credentials and node connectivity to the registry.

### `CreateContainerConfigError`

Check that the ConfigMap, Secret and referenced keys exist in the **same namespace** as the Pod:

```bash
kubectl get configmap external-postgres-item -n micro-app-dev
kubectl get secret dev-db-secret -n micro-app-dev
```

A ConfigMap or Secret in another namespace cannot be referenced directly by this Pod.

### PostgreSQL authentication or connection failure

Inspect the application exception and verify, without printing passwords:

- The JDBC URL points to the correct database.
- The Secret username matches the PostgreSQL role.
- The Secret password matches the role's current password.
- The role has the required database privileges.
- PostgreSQL listens on the expected interface and port.
- PostgreSQL host firewall/network rules allow traffic from the Kubernetes cluster.

Use the temporary `psql` Pod test above to separate database/network issues from application issues.

### Pod is `Running` but not `Ready`

```bash
kubectl get pods -n <NAMESPACE> -o wide
kubectl describe pod <POD_NAME> -n <NAMESPACE>
kubectl logs <POD_NAME> -n <NAMESPACE> --tail=200
kubectl get events -n <NAMESPACE> --sort-by=.metadata.creationTimestamp
```

Check startup/readiness probe failures, application logs, database connection initialization and Pod restarts.

### Service has no ready endpoints

```bash
kubectl describe service <SERVICE_NAME> -n <NAMESPACE>
kubectl get pods -n <NAMESPACE> --show-labels
kubectl get endpointslice -n <NAMESPACE> \
  -l kubernetes.io/service-name=<SERVICE_NAME>
```

The Service selector must match the Pod labels, and the Pod must be Ready to appear as a ready endpoint.

### NodePort unavailable from Windows

```bash
kubectl get service frontend -n micro-app-dev -o wide
```

From Windows PowerShell:

```powershell
Test-NetConnection 192.168.56.10 -Port 30080
```

Check the VirtualBox host-only adapter, routing, node firewall and whether the NodePort is allocated. Try another Ready node IP if necessary.

### Calico or Kubernetes API timeouts

During the recorded QA troubleshooting, events included Calico errors while deleting Pod sandboxes, with a timeout reaching the Kubernetes API Service at `10.96.0.1:443`. The issue coincided with a temporary `worker2` NotReady event and restarts across QA Auth, User and Item Pods.

Inspect before restarting or deleting networking components:

```bash
kubectl get nodes -o wide
kubectl get pods -n kube-system -o wide
kubectl get pods -n calico-system -o wide
kubectl get svc kubernetes -n default
kubectl get endpoints kubernetes -n default
kubectl get events -A --sort-by=.metadata.creationTimestamp
```

Do not assume a QA application problem is caused by PostgreSQL until node health, Calico and API connectivity have been checked.

### `kubectl top` reports `Metrics API not available`

`kubectl top nodes` and `kubectl top pods` require Metrics Server. This is separate from Calico and PostgreSQL. Check whether Metrics Server is deployed and whether the `v1beta1.metrics.k8s.io` APIService is available before using `kubectl top` for resource monitoring.

## 14. Current implementation status and known follow-ups

This README captures the implementation state established during the project work. It is not a claim that every environment has passed final end-to-end testing.

| Component | Dev | Test | QA |
|---|---|---|---|
| External PostgreSQL ConfigMaps | Deployed; connectivity tested | Deployed; connectivity tested | Deployed; connectivity tested |
| Auth Service | Startup verified | Deployment reported complete | Deployment reported complete; recheck after QA node/network incident |
| User Service | Startup verified | Startup verified | Deployment performed; recheck readiness after QA node/network incident |
| Item Service | Startup and endpoint verified | Startup and endpoint verified | Pod had restarts and was not Ready during troubleshooting |
| Frontend chart | Lint/render passed; install still to verify | Lint/render passed; install still to verify | Lint/render passed; install still to verify |
| Frontend API routing | Not yet verified | Not yet verified | Not yet verified |

Known follow-ups:

1. Resolve and verify the QA node/Calico/API connectivity issue, then recheck all three QA backend Pods and their database connections.
2. Install and verify the Frontend release in Dev, Test and QA after confirming NodePort availability.
3. Test Frontend access from the Windows host.
4. Confirm how the Frontend routes browser API requests to Auth, User and Item Services. Configure Ingress or a reverse proxy if needed.
5. Verify that all nine backend service/environment combinations are Ready and connect to the intended databases.
6. Only after successful migration and validation, plan removal of the old in-cluster PostgreSQL and legacy workloads in namespace `micro-app`.

## 15. Legacy in-cluster PostgreSQL and migration safety

The original namespace `micro-app` previously contained the PostgreSQL StatefulSet, Services, ConfigMap, Secret and PVC, as well as the original application Deployments. These are legacy resources from the earlier in-cluster design.

Do not remove the old StatefulSet, PVC, PV, database directory, old Secrets or original workloads merely because the new Helm releases exist. First confirm:

- Dev, Test and QA backend services are Ready.
- Each application connects to the correct external database.
- Frontend browser/API flows work in each environment.
- No remaining workload depends on the old `postgres` Service or `postgres-secret`.
- Required data has been migrated or is intentionally no longer needed.

Perform the retirement as a separately planned cleanup, checking resource ownership and storage retention settings before deleting any persistent storage resources.

## 16. Future enhancements

Possible next steps after the current Dev/Test/QA deployment is stable:

- Configure Ingress and TLS for browser access and API routing.
- Add a proper API gateway or Nginx reverse proxy if required by the Frontend architecture.
- Use immutable application image tags instead of `latest` for controlled releases.
- Configure Metrics Server and resource monitoring.
- Add readiness/liveness HTTP probes if the applications expose suitable health endpoints.
- Add automated Helm lint/render checks to CI/CD.
- Use a secret manager or External Secrets Operator for database credentials.
- Create separate Stage and Production values files pointing to the planned `proddb` host (`192.168.56.15`) after those databases and namespaces are provisioned.

## 17. Quick reference

### Namespaces

```text
micro-app-dev
micro-app-test
micro-app-qa
```

### Database host

```text
192.168.56.14:5432
```

### Backend Services

| Service | Port | ConfigMap suffix |
|---|---:|---|
| Auth | 8080 | `external-postgres-auth` |
| User | 8081 | `external-postgres-user` |
| Item | 8082 | `external-postgres-item` |

### Frontend NodePorts

| Environment | Port |
|---|---:|
| Dev | 30080 |
| Test | 30081 |
| QA | 30082 |

### Useful commands

```bash
# Overall cluster status
kubectl get nodes -o wide

# All application resources in an environment
kubectl get deployments,pods,services -n micro-app-dev

# Helm releases in an environment
helm list -n micro-app-dev

# Latest events in an environment
kubectl get events -n micro-app-dev --sort-by=.metadata.creationTimestamp

# Logs of a deployment
kubectl logs deployment/auth-service -n micro-app-dev --tail=100
```

---

**Project:** Micro_App_Doc  
**Deployment model:** Independent Helm charts for each microservice and environment  
**Database model:** External PostgreSQL with namespace-specific ConfigMaps and Secrets
