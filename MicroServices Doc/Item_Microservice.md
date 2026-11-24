
# Deploy Item Microservice Using Helm in Kubernetes – Dev, Test and QA

## 1. Introduction

In this implementation, we convert the existing Item Service Kubernetes Deployment and Service YAML manifests into an independent Helm chart.

We will deploy Item Service into three Kubernetes environments:

- Development
- Testing
- Quality Assurance

Each environment uses its own Kubernetes namespace, PostgreSQL database, database user and Kubernetes Secret.

We will maintain one reusable Helm chart with separate environment-specific values files.

This approach allows us to deploy, upgrade and roll back Item Service independently in each environment.

## 2. Architecture Overview

### 2.1 Kubernetes Environment Configuration

| Environment | Namespace      | PostgreSQL Database | Database User |
| ----------- | -------------- | ------------------- | ------------- |
| Dev         | micro-app-dev  | dev_item_db         | dev_app       |
| Test        | micro-app-test | test_item_db        | test_app      |
| QA          | micro-app-qa   | qa_item_db          | qa_app        |

### 2.2 Application Configuration

| Component          | Configuration                     |
| ------------------ | --------------------------------- |
| Application        | Item Service                      |
| Docker image       | kartikeyasoft/item-service:latest |
| Container port     | 8082                              |
| Kubernetes Service | ClusterIP                         |
| PostgreSQL host    | 192.168.56.14                     |
| PostgreSQL port    | 5432                              |
| Database ConfigMap | external-postgres-item            |
| Dev Secret         | dev-db-secret                     |
| Test Secret        | test-db-secret                    |
| QA Secret          | qa-db-secret                      |

### 2.3 Architecture Diagram

```
                    Kubernetes Cluster
                            |
                     Item Service Helm
                            |
             +--------------+--------------+
             |              |              |
            Dev            Test            QA
             |              |              |
       micro-app-dev  micro-app-test  micro-app-qa
             |              |              |
       Item Service   Item Service   Item Service
        Pod :8082      Pod :8082      Pod :8082
             |              |              |
       ConfigMap       ConfigMap       ConfigMap
       Secret          Secret          Secret
             |              |              |
             +--------------+--------------+
                            |
                    External PostgreSQL
                       192.168.56.14
                         Port 5432
                            |
             +--------------+--------------+
             |              |              |
         dev_item_db  test_item_db     qa_item_db
         dev_app      test_app         qa_app
```

## 3. Prerequisites

### 3.1 Kubernetes Cluster

Check the Kubernetes nodes:

```
kubectl get nodes -o wide
```

All nodes should be in the `Ready` state.

### 3.2 Helm Installation

Check the Helm version:

```
helm version --short
```

Helm must be installed and accessible from the Kubernetes master node.

### 3.3 Kubernetes Namespaces

Verify:

```
kubectl get namespaces
```

Required namespaces:

```
micro-app-dev
micro-app-test
micro-app-qa
```

Create them only if they do not already exist:

```
kubectl create namespace micro-app-dev
kubectl create namespace micro-app-test
kubectl create namespace micro-app-qa
```

### 3.4 External PostgreSQL Configuration

Our external PostgreSQL server is running on:

```
Host: 192.168.56.14
Port: 5432
```

The following databases and users must already exist:

**Dev**

```
Database: dev_item_db
User: dev_app
```

**Test**

```
Database: test_item_db
User: test_app
```

**QA**

```
Database: qa_item_db
User: qa_app
```

Each database user must have the required privileges on its corresponding database.

### 3.5 External PostgreSQL Helm Chart

We have already created and deployed the `external-postgres` Helm chart in the three namespaces.

Check the releases:

```
helm list -n micro-app-dev
helm list -n micro-app-test
helm list -n micro-app-qa
```

Verify the Item Service ConfigMaps:

```
kubectl get configmap external-postgres-item -n micro-app-dev

kubectl get configmap external-postgres-item -n micro-app-test

kubectl get configmap external-postgres-item -n micro-app-qa
```

Each ConfigMap contains:

```
SPRING_DATASOURCE_URL
```

Expected JDBC URLs:

| Environment | JDBC URL                                          |
| ----------- | ------------------------------------------------- |
| Dev         | jdbc:postgresql://192.168.56.14:5432/dev_item_db  |
| Test        | jdbc:postgresql://192.168.56.14:5432/test_item_db |
| QA          | jdbc:postgresql://192.168.56.14:5432/qa_item_db   |

### 3.6 Kubernetes Database Secrets

We will reuse the existing Kubernetes Secrets:

| Namespace      | Secret         |
| -------------- | -------------- |
| micro-app-dev  | dev-db-secret  |
| micro-app-test | test-db-secret |
| micro-app-qa   | qa-db-secret   |

Each Secret contains:

```
DB_HOST
DB_PORT
DB_NAME
DB_USERNAME
DB_PASSWORD
```

For Item Service, we specifically use:

```
DB_USERNAME
DB_PASSWORD
```

Verify the Secrets:

```
kubectl get secrets -n micro-app-dev

kubectl get secrets -n micro-app-test

kubectl get secrets -n micro-app-qa
```

Do not display actual database passwords or store them in Helm values files.

## 4. Existing Kubernetes Item Service Configuration

Before converting the existing Kubernetes manifests into a Helm chart, our original Item Service Deployment was configured as follows.

File:

```
kubernetes/item-service/deployment.yaml
```

Original Deployment:

```
apiVersion: apps/v1
kind: Deployment

metadata:
  name: item-service
  namespace: micro-app

spec:
  replicas: 1

  selector:
    matchLabels:
      app: item-service

  template:
    metadata:
      labels:
        app: item-service

    spec:
      containers:
        - name: item-service

          image: kartikeyasoft/item-service:latest

          imagePullPolicy: Always

          ports:
            - name: http
              containerPort: 8082

          env:
            - name: SERVER_PORT
              value: "8082"

            - name: SPRING_DATASOURCE_URL
              value: "jdbc:postgresql://postgres:5432/item_db"

            - name: SPRING_DATASOURCE_USERNAME
              valueFrom:
                secretKeyRef:
                  name: postgres-secret
                  key: APP_DB_USERNAME

            - name: SPRING_DATASOURCE_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-secret
                  key: APP_DB_PASSWORD

            - name: SPRING_JPA_HIBERNATE_DDL_AUTO
              value: "update"

          resources:
            requests:
              cpu: 100m
              memory: 256Mi

            limits:
              cpu: 500m
              memory: 768Mi

          startupProbe:
            tcpSocket:
              port: http
            periodSeconds: 10
            failureThreshold: 30

          readinessProbe:
            tcpSocket:
              port: http
            periodSeconds: 10

          livenessProbe:
            tcpSocket:
              port: http
            periodSeconds: 20
```

Original Service:

File:

```
kubernetes/item-service/service.yaml
```

```
apiVersion: v1
kind: Service

metadata:
  name: item-service
  namespace: micro-app

spec:
  type: ClusterIP

  selector:
    app: item-service

  ports:
    - name: http
      port: 8082
      targetPort: 8082
      protocol: TCP
```

### 4.1 Changes required for external PostgreSQL

The original Item Service configuration used the in-cluster PostgreSQL service:

```
jdbc:postgresql://postgres:5432/item_db
```

We will replace this with the environment-specific external PostgreSQL ConfigMap:

```
external-postgres-item
```

We will also replace the old `postgres-secret` references with the environment-specific Secrets:

```
dev-db-secret
test-db-secret
qa-db-secret
```

All other important application settings remain unchanged.

## 5. Create the Item Service Helm Chart

Run these commands on the Kubernetes master node.

Navigate to the project:

```
cd ~/Micro_App_Doc
```

Create the chart directory:

```
mkdir -p helm/item-service/templates

cd helm/item-service
```

### 5.1 Final directory structure

```
item-service/
│
├── Chart.yaml
│
├── values.yaml
├── values-dev.yaml
├── values-test.yaml
├── values-qa.yaml
│
└── templates/
    ├── _helpers.tpl
    ├── deployment.yaml
    └── service.yaml
```

## 6. Create Chart.yaml

File:

```
helm/item-service/Chart.yaml
```

Configuration:

```
apiVersion: v2

name: item-service

description: Helm chart for Item microservice

type: application

version: 0.1.0

appVersion: "1.0.0"
```

Explanation:

| Field       | Description                  |
| ----------- | ---------------------------- |
| apiVersion  | Helm chart API version       |
| name        | Chart name                   |
| description | Purpose of the chart         |
| type        | Application chart            |
| version     | Helm chart version           |
| appVersion  | Application version metadata |

## 7. Create values.yaml

File:

```
helm/item-service/values.yaml
```

This file contains the common application configuration.

```
replicaCount: 1

image:
  repository: kartikeyasoft/item-service
  tag: latest
  pullPolicy: Always

containerPort: 8082

service:
  type: ClusterIP
  port: 8082

database:
  configMapName: external-postgres-item
  urlKey: SPRING_DATASOURCE_URL

  existingSecret: dev-db-secret
  usernameKey: DB_USERNAME
  passwordKey: DB_PASSWORD

jpa:
  ddlAuto: update

resources:
  requests:
    cpu: 100m
    memory: 256Mi
  limits:
    cpu: 500m
    memory: 768Mi

probes:
  startup:
    periodSeconds: 10
    failureThreshold: 30
  readiness:
    periodSeconds: 10
  liveness:
    periodSeconds: 20
```

### 7.1 Explanation of values.yaml

| Parameter               | Purpose                            |
| ----------------------- | ---------------------------------- |
| replicaCount            | Number of Item Service replicas    |
| image.repository        | Docker image repository            |
| image.tag               | Docker image tag                   |
| image.pullPolicy        | Kubernetes image pull policy       |
| containerPort           | Application listening port         |
| service.type            | Kubernetes Service type            |
| database.configMapName  | Item database ConfigMap            |
| database.existingSecret | Existing database Secret           |
| usernameKey             | Secret key for database username   |
| passwordKey             | Secret key for database password   |
| jpa.ddlAuto             | Hibernate schema management        |
| resources               | CPU and memory requests and limits |
| probes                  | Application health-check settings  |

## 8. Create Environment-Specific Values Files

We use separate values files for Dev, Test and QA.

### 8.1 Dev – values-dev.yaml

File:

```
helm/item-service/values-dev.yaml
```

```
environment: dev

database:
  configMapName: external-postgres-item
  existingSecret: dev-db-secret
```

Dev configuration:

```
Namespace: micro-app-dev

Database:
dev_item_db

Database user:
dev_app

ConfigMap:
external-postgres-item

Secret:
dev-db-secret
```

### 8.2 Test – values-test.yaml

File:

```
helm/item-service/values-test.yaml
```

```
environment: test

database:
  configMapName: external-postgres-item
  existingSecret: test-db-secret
```

Test configuration:

```
Namespace: micro-app-test

Database:
test_item_db

Database user:
test_app

ConfigMap:
external-postgres-item

Secret:
test-db-secret
```

### 8.3 QA – values-qa.yaml

File:

```
helm/item-service/values-qa.yaml
```

```
environment: qa

database:
  configMapName: external-postgres-item
  existingSecret: qa-db-secret
```

QA configuration:

```
Namespace: micro-app-qa

Database:
qa_item_db

Database user:
qa_app

ConfigMap:
external-postgres-item

Secret:
qa-db-secret
```

The ConfigMap name remains the same because it exists separately in each namespace.

The Secret name changes according to the deployment environment.

## 9. Create Helm Templates

### 9.1 Create \_helpers.tpl

File:

```
helm/item-service/templates/_helpers.tpl
```

Configuration:

```
{{- define "item-service.fullname" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{- define "item-service.selectorLabels" -}}
app.kubernetes.io/name: item-service
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "item-service.labels" -}}
{{ include "item-service.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
environment: {{ .Values.environment | default "unknown" | quote }}
{{- end }}
```

The helper templates generate common resource names and labels.

For our implementation, the Helm release name is:

```
item-service
```

Generated resources:

```
Deployment: item-service
Service: item-service
```

### 9.2 Create deployment.yaml

File:

```
helm/item-service/templates/deployment.yaml
```

Configuration:

```
apiVersion: apps/v1
kind: Deployment

metadata:
  name: {{ include "item-service.fullname" . }}

  labels:
    {{- include "item-service.labels" . | nindent 4 }}

spec:
  replicas: {{ .Values.replicaCount }}

  selector:
    matchLabels:
      {{- include "item-service.selectorLabels" . | nindent 6 }}

  template:
    metadata:
      labels:
        {{- include "item-service.labels" . | nindent 8 }}

    spec:
      containers:
        - name: item-service

          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"

          imagePullPolicy: {{ .Values.image.pullPolicy }}

          ports:
            - name: http
              containerPort: {{ .Values.containerPort }}
              protocol: TCP

          env:
            - name: SERVER_PORT
              value: {{ .Values.containerPort | quote }}

            - name: SPRING_DATASOURCE_URL
              valueFrom:
                configMapKeyRef:
                  name: {{ .Values.database.configMapName }}
                  key: {{ .Values.database.urlKey }}

            - name: SPRING_DATASOURCE_USERNAME
              valueFrom:
                secretKeyRef:
                  name: {{ .Values.database.existingSecret }}
                  key: {{ .Values.database.usernameKey }}

            - name: SPRING_DATASOURCE_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: {{ .Values.database.existingSecret }}
                  key: {{ .Values.database.passwordKey }}

            - name: SPRING_JPA_HIBERNATE_DDL_AUTO
              value: {{ .Values.jpa.ddlAuto | quote }}

          resources:
            {{- toYaml .Values.resources | nindent 12 }}

          startupProbe:
            tcpSocket:
              port: http
            periodSeconds: {{ .Values.probes.startup.periodSeconds }}
            failureThreshold: {{ .Values.probes.startup.failureThreshold }}

          readinessProbe:
            tcpSocket:
              port: http
            periodSeconds: {{ .Values.probes.readiness.periodSeconds }}

          livenessProbe:
            tcpSocket:
              port: http
            periodSeconds: {{ .Values.probes.liveness.periodSeconds }}
```

### 9.3 Database configuration mapping

| Application variable       | Kubernetes source                 |
| -------------------------- | --------------------------------- |
| SPRING_DATASOURCE_URL      | external-postgres-item ConfigMap  |
| SPRING_DATASOURCE_USERNAME | DB_USERNAME in environment Secret |
| SPRING_DATASOURCE_PASSWORD | DB_PASSWORD in environment Secret |

For example, Dev Item Service connects to `dev_item_db` using credentials from `dev-db-secret`.

### 9.4 Create service.yaml

File:

```
helm/item-service/templates/service.yaml
```

Configuration:

```
apiVersion: v1
kind: Service

metadata:
  name: {{ include "item-service.fullname" . }}

  labels:
    {{- include "item-service.labels" . | nindent 4 }}

spec:
  type: {{ .Values.service.type }}

  selector:
    {{- include "item-service.selectorLabels" . | nindent 4 }}

  ports:
    - name: http
      port: {{ .Values.service.port }}
      targetPort: http
      protocol: TCP
```

This creates a ClusterIP Service.

Within the same namespace, other applications can access Item Service through:

```
http://item-service:8082
```

### 9.5 Namespace configuration

The Deployment and Service templates do not hardcode `metadata.namespace`.

Helm automatically uses the namespace supplied during installation.

For example:

```
--namespace micro-app-qa
```

## 10. Validate the Item Service Helm Chart

Navigate to:

```
cd ~/Micro_App_Doc/helm/item-service
```

### 10.1 Verify directory structure

```
find . -maxdepth 2 -type f | sort
```

### 10.2 Run Helm lint

```
helm lint .
```

Actual validation result:

```
==> Linting .
[INFO] Chart.yaml: icon is recommended

1 chart(s) linted, 0 chart(s) failed
```

The icon message is only a recommendation.

### 10.3 Render Dev configuration

```
helm template item-service . \
  --namespace micro-app-dev \
  -f values-dev.yaml
```

Expected:

| Setting      | Value                             |
| ------------ | --------------------------------- |
| Deployment   | item-service                      |
| Image        | kartikeyasoft/item-service:latest |
| Port         | 8082                              |
| ConfigMap    | external-postgres-item            |
| Secret       | dev-db-secret                     |
| Username key | DB_USERNAME                       |
| Password key | DB_PASSWORD                       |

### 10.4 Render Test configuration

```
helm template item-service . \
  --namespace micro-app-test \
  -f values-test.yaml
```

Verify:

```
external-postgres-item
test-db-secret
```

### 10.5 Render QA configuration

```
helm template item-service . \
  --namespace micro-app-qa \
  -f values-qa.yaml
```

Verify:

```
external-postgres-item
qa-db-secret
```

These commands render Kubernetes manifests; they do not install resources.

## 11. Deploy Item Service in Dev

Navigate to:

```
cd ~/Micro_App_Doc/helm/item-service
```

Install the chart:

```
helm upgrade --install item-service . \
  --namespace micro-app-dev \
  -f values-dev.yaml
```

Expected:

```
NAME: item-service
NAMESPACE: micro-app-dev
STATUS: deployed
```

### 11.1 Verify Helm release

```
helm list -n micro-app-dev
```

### 11.2 Verify Kubernetes resources

```
kubectl get deployments,pods,services -n micro-app-dev
```

Expected Deployment:

```
deployment.apps/item-service   1/1   1   1
```

### 11.3 Check rollout

```
kubectl rollout status deployment/item-service \
  -n micro-app-dev --timeout=180s
```

### 11.4 Check application logs

```
kubectl logs deployment/item-service \
  -n micro-app-dev --tail=100
```

Successful startup messages observed during our implementation:

```
Initialized JPA EntityManagerFactory
Tomcat started on port 8082
Started ItemApplication
```

### 11.5 Verify Service endpoint

```
kubectl get endpointslice \
  -n micro-app-dev \
  -l kubernetes.io/service-name=item-service
```

Verified Dev endpoint:

```
10.244.235.167:8082
```

This confirms that the Dev Item Service had a ready endpoint.

## 12. Deploy Item Service in Test

Run:

```
cd ~/Micro_App_Doc/helm/item-service
```

Install:

```
helm upgrade --install item-service . \
  --namespace micro-app-test \
  -f values-test.yaml
```

### 12.1 Verify Helm release

```
helm list -n micro-app-test
```

### 12.2 Verify Deployment and Pod

```
kubectl get deployments,pods,services -n micro-app-test
```

### 12.3 Check rollout

```
kubectl rollout status deployment/item-service \
  -n micro-app-test --timeout=180s
```

### 12.4 Check application logs

```
kubectl logs deployment/item-service \
  -n micro-app-test --tail=100
```

Successful startup messages observed during our implementation:

```
Initialized JPA EntityManagerFactory
Tomcat started on port 8082
Started ItemApplication
```

### 12.5 Verify Service endpoint

```
kubectl get endpointslice \
  -n micro-app-test \
  -l kubernetes.io/service-name=item-service
```

Verified Test endpoint:

```
10.244.189.109:8082
```

This confirms that the Test Item Service had a ready endpoint.

## 13. Deploy Item Service in QA

Now deploy the same Helm chart in the QA namespace.

Run:

```
cd ~/Micro_App_Doc/helm/item-service
```

Install or upgrade:

```
helm upgrade --install item-service . \
  --namespace micro-app-qa \
  -f values-qa.yaml
```

### 13.1 Verify Helm release

```
helm list -n micro-app-qa

helm status item-service -n micro-app-qa
```

### 13.2 Verify Kubernetes resources

```
kubectl get deployments,pods,services -n micro-app-qa -o wide
```

### 13.3 Check rollout

```
kubectl rollout status deployment/item-service \
  -n micro-app-qa --timeout=180s
```

### 13.4 Check application logs

```
kubectl logs deployment/item-service \
  -n micro-app-qa --tail=250
```

Look for:

```
Initialized JPA EntityManagerFactory
Tomcat started on port 8082
Started ItemApplication
```

These are expected startup indicators, not a substitute for checking Pod readiness and database connectivity.

### 13.5 Verify Service endpoint

```
kubectl get endpointslice \
  -n micro-app-qa \
  -l kubernetes.io/service-name=item-service
```

Expected:

- A ready endpoint.
- Port `8082`.
- A current Item Service Pod IP.

### 13.6 QA database configuration

| Setting         | Value                  |
| --------------- | ---------------------- |
| Namespace       | micro-app-qa           |
| PostgreSQL host | 192.168.56.14          |
| PostgreSQL port | 5432                   |
| Database        | qa_item_db             |
| Database user   | qa_app                 |
| ConfigMap       | external-postgres-item |
| Secret          | qa-db-secret           |

## 14. QA Troubleshooting – Kubernetes Networking and Pod Restarts

During our QA deployment, the Item Service Pod encountered database connection initialization errors and repeated restarts.

Importantly, we also observed similar failures in Auth Service and User Service in the QA namespace.

### 14.1 Observed QA Pod status

At the time of troubleshooting:

```
NAME                            READY   STATUS    RESTARTS
auth-service-6ff55d8d8b-x4qkd   0/1     Running   4
item-service-5b9cbbbc4c-8v2lj   0/1     Running   3
user-service-6779948d9c-nqrxv   0/1     Running   3
```

All three services were affected.

### 14.2 Verify QA ConfigMap

Run:

```
kubectl get configmap external-postgres-item \
  -n micro-app-qa -o yaml
```

Expected:

```
SPRING_DATASOURCE_URL:
jdbc:postgresql://192.168.56.14:5432/qa_item_db
```

During our investigation, this JDBC URL was confirmed correct.

### 14.3 Verify QA Secret keys

```
kubectl get secret qa-db-secret \
  -n micro-app-qa \
  -o go-template='{{range $k, $v := .data}}{{printf "%s\n" $k}}{{end}}'
```

Expected:

```
DB_HOST
DB_NAME
DB_PASSWORD
DB_PORT
DB_USERNAME
```

The presence of these keys confirms the Secret structure. It does not independently verify that the password authenticates against PostgreSQL.

### 14.4 Check Kubernetes nodes

```
kubectl get nodes -o wide
```

The earlier incident showed `worker2` temporarily changing to `NotReady`.

At a later inspection, all four nodes were:

```
master    Ready
worker1   Ready
worker2   Ready
worker3   Ready
```

### 14.5 Check Calico networking

The important event observed during our investigation was:

```
FailedKillPod

plugin type="calico" failed (delete)

error getting ClusterInformation:

dial tcp 10.96.0.1:443: i/o timeout
```

This indicated that Calico could not reach the Kubernetes API Service while cleaning up an old Pod network.

Because the Auth, User and Item Pods were all affected, the problem required cluster-level networking investigation rather than changing only the Item Service Helm chart.

### 14.6 Inspect Kubernetes system Pods

```
kubectl get pods -n kube-system -o wide
```

Check Calico:

```
kubectl get pods -n calico-system -o wide
```

Check Kubernetes API Service:

```
kubectl get svc kubernetes -n default

kubectl get endpoints kubernetes -n default
```

### 14.7 Check worker node status

For worker2:

```
kubectl describe node worker2
```

For worker3:

```
kubectl describe node worker3
```

Inspect the following conditions:

```
Ready
NetworkUnavailable
MemoryPressure
DiskPressure
PIDPressure
```

### 14.8 Inspect QA application logs

```
kubectl logs deployment/item-service \
  -n micro-app-qa --tail=300
```

If the application container has restarted:

```
kubectl logs deployment/item-service \
  -n micro-app-qa --previous --tail=250
```

Inspect application exceptions around:

```
Caused by:
SQLException
Connection refused
password authentication failed
HikariPool
```

Do not change database credentials or Helm values until the underlying problem is identified.

### 14.9 Verify actual database connectivity

After cluster networking is stable, run a PostgreSQL client Pod using the existing QA Secret.

Create:

```
cat > /tmp/qa-item-db-test.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: qa-item-db-test
  namespace: micro-app-qa
spec:
  restartPolicy: Never
  containers:
    - name: postgres-client
      image: postgres:16
      command: ["/bin/sh", "-c"]
      args:
        - |
          set -eu

          PGPASSWORD="$DB_PASSWORD" psql \
            --host="$DB_HOST" \
            --port="$DB_PORT" \
            --username="$DB_USERNAME" \
            --dbname="qa_item_db" \
            --no-password \
            --set=ON_ERROR_STOP=1 \
            --command="SELECT current_database(), current_user;"
      envFrom:
        - secretRef:
            name: qa-db-secret
EOF
```

Apply:

```
kubectl apply -f /tmp/qa-item-db-test.yaml
```

Check:

```
kubectl get pod qa-item-db-test -n micro-app-qa -w
```

When the Pod reaches `Completed`, check its logs:

```
kubectl logs qa-item-db-test -n micro-app-qa
```

Expected:

```
qa_item_db | qa_app
```

Remove the temporary Pod:

```
kubectl delete pod qa-item-db-test -n micro-app-qa

rm -f /tmp/qa-item-db-test.yaml
```

This test confirms that a Pod in the QA namespace can authenticate to the QA Item database.

## 15. Final Verification Across All Environments

### 15.1 Check Helm releases

```
helm list -n micro-app-dev

helm list -n micro-app-test

helm list -n micro-app-qa
```

Each namespace should contain:

```
external-postgres
auth-service
user-service
item-service
```

### 15.2 Check Item Service Deployments

```
kubectl get deployments -A | grep item-service
```

Expected when all environments are healthy:

```
micro-app-dev    item-service    1/1
micro-app-test   item-service    1/1
micro-app-qa     item-service    1/1
```

### 15.3 Check Pods

```
kubectl get pods -n micro-app-dev

kubectl get pods -n micro-app-test

kubectl get pods -n micro-app-qa
```

All Item Service Pods should show:

```
READY   STATUS
1/1     Running
```

### 15.4 Check Services

```
kubectl get services -A | grep item-service
```

Each namespace should have a ClusterIP Service exposing port `8082`.

### 15.5 Check EndpointSlices

```
kubectl get endpointslice \
  -n micro-app-dev \
  -l kubernetes.io/service-name=item-service

kubectl get endpointslice \
  -n micro-app-test \
  -l kubernetes.io/service-name=item-service

kubectl get endpointslice \
  -n micro-app-qa \
  -l kubernetes.io/service-name=item-service
```

Each environment should have a ready backend endpoint.

## 16. Helm Upgrade and Rollback

### 16.1 Upgrade Item Service in Dev

When a new Docker image version becomes available:

```
helm upgrade item-service . \
  --namespace micro-app-dev \
  -f values-dev.yaml \
  --set image.tag=1.1.0
```

For repeatable deployments, update the image tag in the values file and commit the change to source control.

### 16.2 Check release history

```
helm history item-service -n micro-app-dev
```

### 16.3 Roll back to a previous revision

```
helm rollback item-service 1 \
  --namespace micro-app-dev
```

Replace `1` with the actual revision you want to restore.

Test and QA releases can be upgraded and rolled back independently.

## 17. Troubleshooting

### 17.1 ImagePullBackOff

```
kubectl describe pod -n micro-app-dev \
  -l app.kubernetes.io/name=item-service
```

Check image name, tag, registry access and image pull authentication.

### 17.2 CreateContainerConfigError

Check the ConfigMap:

```
kubectl get configmap external-postgres-item \
  -n micro-app-dev
```

Check the Secret:

```
kubectl get secret dev-db-secret \
  -n micro-app-dev
```

Verify that the expected ConfigMap key and Secret keys exist.

### 17.3 CrashLoopBackOff

```
kubectl logs deployment/item-service \
  -n micro-app-dev --tail=100
```

Check previous container logs:

```
kubectl logs deployment/item-service \
  -n micro-app-dev --previous --tail=100
```

Investigate application startup errors, JDBC connection errors and authentication failures.

### 17.4 Service Has No Endpoints

```
kubectl get pods -n micro-app-dev

kubectl describe service item-service \
  -n micro-app-dev

kubectl get endpointslice \
  -n micro-app-dev \
  -l kubernetes.io/service-name=item-service
```

Check that the Pod is Ready and its labels match the Service selector.

### 17.5 Calico Networking Issues

Check:

```
kubectl get pods -n calico-system -o wide

kubectl get nodes -o wide

kubectl get endpoints kubernetes -n default
```

If Calico cannot reach the Kubernetes API Service, investigate the node networking and API connectivity before changing application configuration.

## 18. Important Implementation Notes

1. We use one reusable Item Service Helm chart across Dev, Test and QA.
2. Each environment has an independent Helm release.
3. Each environment runs inside its own Kubernetes namespace.
4. We use `external-postgres-item` for the JDBC configuration.
5. We reuse existing Kubernetes database Secrets.
6. Passwords are not stored in Helm values files or ConfigMaps.
7. Application database variables are populated using Kubernetes `valueFrom` references.
8. The external PostgreSQL server runs independently of the Item Service chart.
9. The Item Service ClusterIP Service exposes port `8082`.
10. Namespace values are passed during Helm installation instead of being hardcoded in templates.
11. Changes to ConfigMaps consumed as environment variables require new application Pods before the changed values take effect.
12. The old in-cluster PostgreSQL resources should be removed only after all applications have been migrated and validated.
13. QA runtime health must be verified independently from successful Helm installation.

## 19. Final Project Structure

After completing the three microservice charts, our project structure is:

```
Micro_App_Doc/
│
└── helm/
    │
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
    │
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
    │
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
    │
    └── item-service/
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

## 20. Implementation Status

Based on the actual deployment and verification outputs:

| Component             | Dev         | Test         | QA                                                  |
| --------------------- | ----------- | ------------ | --------------------------------------------------- |
| Helm chart validation | Passed      | Passed       | Passed                                              |
| Helm release          | Deployed    | Deployed     | Installation attempted                              |
| Deployment            | Running     | Running      | Not Ready at last check                             |
| Pod                   | Running     | Running      | Restarting                                          |
| Service               | Created     | Created      | Created                                             |
| ConfigMap reference   | Correct     | Correct      | Correct                                             |
| Secret reference      | Configured  | Configured   | Configured                                          |
| PostgreSQL database   | dev_item_db | test_item_db | qa_item_db                                          |
| Spring Boot startup   | Successful  | Successful   | Connection initialization issue under investigation |

Verified endpoints:

**Dev**

```
10.244.235.167:8082
```

**Test**

```
10.244.189.109:8082
```

QA remains pending final verification.

During the QA investigation, Kubernetes events also recorded temporary node-readiness and Calico API connectivity errors affecting Auth, User and Item Service. Therefore, QA application health should be marked complete only after the cluster networking issue is resolved and all three services pass their readiness and database connection checks.

## 21. Conclusion

We have created a reusable Helm chart for Item Service and successfully deployed it in Dev and Test.

The same chart is used across all three environments, with the database URLs and credentials selected through environment-specific ConfigMaps and Secrets.

This implementation provides:

- Independent Item Service deployment.
- Environment-specific PostgreSQL connections.
- Secure use of existing Kubernetes Secrets.
- Consistent application deployment configuration.
- Independent upgrades and rollbacks.
- Easier maintenance and future scaling.

The final QA deployment requires completion of the Kubernetes networking investigation before it can be marked healthy.

**Next implementation:** Complete QA recovery, validate all nine microservice deployments, and then plan the removal of the old in-cluster PostgreSQL resources.

**End of Article**

**QA status clarification:** The recorded QA Item Service configuration points to the correct `qa_item_db`, but its Pod was `0/1` with restarts during the incident. The Calico API timeout also affected QA Auth and User Services, so the article correctly separates successful chart configuration from successful runtime health.
