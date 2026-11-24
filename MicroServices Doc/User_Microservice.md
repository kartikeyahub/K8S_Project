# Deploy User Microservice Using Helm in Kubernetes – Dev, Test and QA

## 1. Introduction

In this implementation, we convert the existing User Service Kubernetes Deployment and Service YAML manifests into an independent Helm chart.

We will deploy User Service into three Kubernetes environments:

- Development
- Testing
- Quality Assurance

Each environment will have its own Kubernetes namespace, PostgreSQL database, database user and Kubernetes Secret.

We will maintain one reusable Helm chart with separate environment-specific values files.

This approach allows us to deploy, upgrade, configure and roll back User Service independently in each environment.

## 2. Architecture Overview

### 2.1 Kubernetes Environment Configuration

| Environment | Namespace      | PostgreSQL Database | Database User |
| ----------- | -------------- | ------------------- | ------------- |
| Dev         | micro-app-dev  | dev_user_db         | dev_app       |
| Test        | micro-app-test | test_user_db        | test_app      |
| QA          | micro-app-qa   | qa_user_db          | qa_app        |

### 2.2 Application Configuration

| Component          | Configuration                     |
| ------------------ | --------------------------------- |
| Application        | User Service                      |
| Docker image       | kartikeyasoft/user-service:latest |
| Container port     | 8081                              |
| Kubernetes Service | ClusterIP                         |
| PostgreSQL host    | 192.168.56.14                     |
| PostgreSQL port    | 5432                              |
| Database ConfigMap | external-postgres-user            |
| Dev Secret         | dev-db-secret                     |
| Test Secret        | test-db-secret                    |
| QA Secret          | qa-db-secret                      |

### 2.3 Architecture Diagram

```
                    Kubernetes Cluster
                            |
                    User Service Helm
                            |
             +--------------+--------------+
             |              |              |
            Dev            Test            QA
             |              |              |
       micro-app-dev  micro-app-test  micro-app-qa
             |              |              |
       User Service   User Service   User Service
         Pod :8081     Pod :8081     Pod :8081
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
         dev_user_db   test_user_db    qa_user_db
         dev_app       test_app        qa_app
```

## 3. Prerequisites

Before creating the User Service Helm chart, verify the following requirements.

### 3.1 Kubernetes Cluster

Check the nodes:

```
kubectl get nodes -o wide
```

All Kubernetes nodes should be in the `Ready` state.

### 3.2 Helm Installation

Check Helm:

```
helm version --short
```

Helm must be installed and accessible from the Kubernetes master node.

### 3.3 Kubernetes Namespaces

Verify the application namespaces:

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

We are using an external PostgreSQL server running on:

```
Host: 192.168.56.14
Port: 5432
```

The following databases and users must already exist.

**Dev**

```
Database: dev_user_db
User: dev_app
```

**Test**

```
Database: test_user_db
User: test_app
```

**QA**

```
Database: qa_user_db
User: qa_app
```

Each database user must have the necessary privileges on the corresponding environment database.

### 3.5 External PostgreSQL Helm Chart

We have already deployed the `external-postgres` Helm chart in all three namespaces.

Verify the releases:

```
helm list -n micro-app-dev
helm list -n micro-app-test
helm list -n micro-app-qa
```

Verify the User Service ConfigMap in each namespace:

```
kubectl get configmap external-postgres-user -n micro-app-dev

kubectl get configmap external-postgres-user -n micro-app-test

kubectl get configmap external-postgres-user -n micro-app-qa
```

Each ConfigMap contains:

```
SPRING_DATASOURCE_URL
```

Expected JDBC URLs:

| Environment | JDBC URL                                          |
| ----------- | ------------------------------------------------- |
| Dev         | jdbc:postgresql://192.168.56.14:5432/dev_user_db  |
| Test        | jdbc:postgresql://192.168.56.14:5432/test_user_db |
| QA          | jdbc:postgresql://192.168.56.14:5432/qa_user_db   |

### 3.6 Kubernetes Database Secrets

We will reuse the existing Kubernetes Secrets.

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

For User Service, we specifically use:

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

Do not display actual database passwords or place them in Helm values files.

## 4. Existing Kubernetes User Service Configuration

Before converting the existing Kubernetes manifests into a Helm chart, our original User Service Deployment was configured as follows.

File:

```
kubernetes/user-service/deployment.yaml
```

Original Deployment:

```
apiVersion: apps/v1
kind: Deployment

metadata:
  name: user-service
  namespace: micro-app

spec:
  replicas: 1

  selector:
    matchLabels:
      app: user-service

  template:
    metadata:
      labels:
        app: user-service

    spec:
      containers:
        - name: user-service

          image: kartikeyasoft/user-service:latest

          imagePullPolicy: Always

          ports:
            - name: http
              containerPort: 8081

          env:
            - name: SERVER_PORT
              value: "8081"

            - name: SPRING_DATASOURCE_URL
              value: "jdbc:postgresql://postgres:5432/user_db"

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
kubernetes/user-service/service.yaml
```

```
apiVersion: v1
kind: Service

metadata:
  name: user-service
  namespace: micro-app

spec:
  type: ClusterIP

  selector:
    app: user-service

  ports:
    - name: http
      port: 8081
      targetPort: 8081
      protocol: TCP
```

### 4.1 Changes required for external PostgreSQL

The original application configuration used the in-cluster PostgreSQL service:

```
jdbc:postgresql://postgres:5432/user_db
```

We will replace this configuration with the external PostgreSQL ConfigMap:

```
external-postgres-user
```

We will also replace the old `postgres-secret` references with the environment-specific Secrets:

```
dev-db-secret
test-db-secret
qa-db-secret
```

All other important application settings will remain unchanged.

## 5. Create the User Service Helm Chart

Run the following commands on the Kubernetes master node.

Navigate to the project:

```
cd ~/Micro_App_Doc
```

Create the Helm chart directories:

```
mkdir -p helm/user-service/templates

cd helm/user-service
```

### 5.1 Final Directory Structure

```
user-service/
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
helm/user-service/Chart.yaml
```

Configuration:

```
apiVersion: v2

name: user-service

description: Helm chart for User microservice

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
helm/user-service/values.yaml
```

This file contains the common application configuration.

```
replicaCount: 1

image:
  repository: kartikeyasoft/user-service
  tag: latest
  pullPolicy: Always

containerPort: 8081

service:
  type: ClusterIP
  port: 8081

database:
  configMapName: external-postgres-user
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
| replicaCount            | Number of User Service replicas    |
| image.repository        | Docker image repository            |
| image.tag               | Docker image tag                   |
| image.pullPolicy        | Kubernetes image pull policy       |
| containerPort           | Application listening port         |
| service.type            | Kubernetes Service type            |
| database.configMapName  | User database ConfigMap            |
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
helm/user-service/values-dev.yaml
```

```
environment: dev

database:
  configMapName: external-postgres-user
  existingSecret: dev-db-secret
```

Dev configuration:

```
Namespace: micro-app-dev

Database:
dev_user_db

Database user:
dev_app

ConfigMap:
external-postgres-user

Secret:
dev-db-secret
```

### 8.2 Test – values-test.yaml

File:

```
helm/user-service/values-test.yaml
```

```
environment: test

database:
  configMapName: external-postgres-user
  existingSecret: test-db-secret
```

Test configuration:

```
Namespace: micro-app-test

Database:
test_user_db

Database user:
test_app

ConfigMap:
external-postgres-user

Secret:
test-db-secret
```

### 8.3 QA – values-qa.yaml

File:

```
helm/user-service/values-qa.yaml
```

```
environment: qa

database:
  configMapName: external-postgres-user
  existingSecret: qa-db-secret
```

QA configuration:

```
Namespace: micro-app-qa

Database:
qa_user_db

Database user:
qa_app

ConfigMap:
external-postgres-user

Secret:
qa-db-secret
```

The ConfigMap name is identical across environments because it exists separately in each namespace.

The Secret name changes according to the environment.

## 9. Create Helm Templates

### 9.1 Create \_helpers.tpl

File:

```
helm/user-service/templates/_helpers.tpl
```

Configuration:

```
{{- define "user-service.fullname" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{- define "user-service.selectorLabels" -}}
app.kubernetes.io/name: user-service
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "user-service.labels" -}}
{{ include "user-service.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
environment: {{ .Values.environment | default "unknown" | quote }}
{{- end }}
```

Explanation:

The helper templates generate common resource names and labels.

For our implementation, the Helm release name is:

```
user-service
```

Therefore, the generated Kubernetes resources are:

```
Deployment: user-service
Service: user-service
```

### 9.2 Create deployment.yaml

File:

```
helm/user-service/templates/deployment.yaml
```

Configuration:

```
apiVersion: apps/v1
kind: Deployment

metadata:
  name: {{ include "user-service.fullname" . }}

  labels:
    {{- include "user-service.labels" . | nindent 4 }}

spec:
  replicas: {{ .Values.replicaCount }}

  selector:
    matchLabels:
      {{- include "user-service.selectorLabels" . | nindent 6 }}

  template:
    metadata:
      labels:
        {{- include "user-service.labels" . | nindent 8 }}

    spec:
      containers:
        - name: user-service

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

### 9.3 Explanation of Database Configuration

The User Service Deployment receives three important Spring Boot environment variables.

**JDBC URL**

```
- name: SPRING_DATASOURCE_URL
  valueFrom:
    configMapKeyRef:
      name: external-postgres-user
      key: SPRING_DATASOURCE_URL
```

This reads the JDBC URL from the User Service ConfigMap.

**Database username**

```
- name: SPRING_DATASOURCE_USERNAME
  valueFrom:
    secretKeyRef:
      name: dev-db-secret
      key: DB_USERNAME
```

This reads the database username from the environment-specific Secret.

**Database password**

```
- name: SPRING_DATASOURCE_PASSWORD
  valueFrom:
    secretKeyRef:
      name: dev-db-secret
      key: DB_PASSWORD
```

This reads the password securely from the existing Kubernetes Secret.

For Test and QA, Helm substitutes the corresponding Secret name through their values files.

### 9.4 Create service.yaml

File:

```
helm/user-service/templates/service.yaml
```

Configuration:

```
apiVersion: v1
kind: Service

metadata:
  name: {{ include "user-service.fullname" . }}

  labels:
    {{- include "user-service.labels" . | nindent 4 }}

spec:
  type: {{ .Values.service.type }}

  selector:
    {{- include "user-service.selectorLabels" . | nindent 4 }}

  ports:
    - name: http
      port: {{ .Values.service.port }}
      targetPort: http
      protocol: TCP
```

This creates a ClusterIP Service.

Within the same namespace, other applications can access User Service using:

```
http://user-service:8081
```

### 9.5 Namespace configuration

We do not hardcode `metadata.namespace` in the Deployment or Service templates.

Helm automatically uses the namespace specified during installation.

For example:

```
--namespace micro-app-dev
```

The same Helm chart can therefore be reused in Dev, Test and QA.

## 10. Validate the User Service Helm Chart

Before installing the chart, validate its structure and templates.

Navigate to:

```
cd ~/Micro_App_Doc/helm/user-service
```

### 10.1 Verify directory structure

```
find . -maxdepth 2 -type f | sort
```

Expected:

```
./Chart.yaml
./templates/_helpers.tpl
./templates/deployment.yaml
./templates/service.yaml
./values-dev.yaml
./values-qa.yaml
./values-test.yaml
./values.yaml
```

### 10.2 Run Helm lint

```
helm lint .
```

Expected:

```
==> Linting .
[INFO] Chart.yaml: icon is recommended

1 chart(s) linted, 0 chart(s) failed
```

The icon message is only a recommendation, not a validation failure.

### 10.3 Render Dev configuration

```
helm template user-service . \
  --namespace micro-app-dev \
  -f values-dev.yaml
```

Verify:

| Setting        | Expected                          |
| -------------- | --------------------------------- |
| Deployment     | user-service                      |
| Image          | kartikeyasoft/user-service:latest |
| Container port | 8081                              |
| ConfigMap      | external-postgres-user            |
| Secret         | dev-db-secret                     |
| Username key   | DB_USERNAME                       |
| Password key   | DB_PASSWORD                       |
| Hibernate      | update                            |

The rendered Deployment should contain references to the ConfigMap and Secret through `valueFrom`.

It should not contain the actual database password.

### 10.4 Render Test configuration

```
helm template user-service . \
  --namespace micro-app-test \
  -f values-test.yaml
```

Verify the Secret reference:

```
test-db-secret
```

### 10.5 Render QA configuration

```
helm template user-service . \
  --namespace micro-app-qa \
  -f values-qa.yaml
```

Verify the Secret reference:

```
qa-db-secret
```

These commands render Kubernetes YAML only. They do not install or modify resources.

## 11. Deploy User Service in Dev

After the chart passes validation, deploy User Service in the Dev namespace.

Navigate to the chart:

```
cd ~/Micro_App_Doc/helm/user-service
```

Install the chart:

```
helm upgrade --install user-service . \
  --namespace micro-app-dev \
  -f values-dev.yaml
```

Expected:

```
NAME: user-service
NAMESPACE: micro-app-dev
STATUS: deployed
```

### 11.1 Verify Helm release

```
helm list -n micro-app-dev
```

Expected releases include:

```
auth-service
external-postgres
user-service
```

### 11.2 Verify Kubernetes resources

```
kubectl get deployments,pods,services -n micro-app-dev
```

Expected:

```
deployment.apps/auth-service   1/1
deployment.apps/user-service   1/1
```

### 11.3 Verify Pod status

```
kubectl get pods -n micro-app-dev -o wide
```

User Service should show:

```
READY   STATUS
1/1     Running
```

### 11.4 Check rollout

```
kubectl rollout status deployment/user-service \
  -n micro-app-dev --timeout=180s
```

Expected:

```
deployment "user-service" successfully rolled out
```

### 11.5 Check application logs

```
kubectl logs deployment/user-service \
  -n micro-app-dev --tail=100
```

Look for successful Spring Boot startup and successful database initialization.

Our actual Dev implementation produced these important log messages:

```
Initialized JPA EntityManagerFactory
Tomcat started on port 8081
Started UserApplication
```

These confirm that the application started and initialized its JPA persistence layer.

### 11.6 Verify Service endpoint

```
kubectl get endpointslice \
  -n micro-app-dev \
  -l kubernetes.io/service-name=user-service
```

The EndpointSlice should show a ready endpoint on port `8081`.

In our Dev deployment, the verified endpoint was:

```
10.244.189.107:8081
```

## 12. Deploy User Service in Test

Now install the same Helm chart in the Test namespace.

Run:

```
cd ~/Micro_App_Doc/helm/user-service
```

Install:

```
helm upgrade --install user-service . \
  --namespace micro-app-test \
  -f values-test.yaml
```

### 12.1 Verify Helm release

```
helm list -n micro-app-test
```

### 12.2 Verify Kubernetes resources

```
kubectl get deployments,pods,services -n micro-app-test
```

### 12.3 Check rollout

```
kubectl rollout status deployment/user-service \
  -n micro-app-test --timeout=180s
```

### 12.4 Check application logs

```
kubectl logs deployment/user-service \
  -n micro-app-test --tail=100
```

Look for:

```
Initialized JPA EntityManagerFactory
Tomcat started on port 8081
Started UserApplication
```

### 12.5 Verify Service endpoint

```
kubectl get endpointslice \
  -n micro-app-test \
  -l kubernetes.io/service-name=user-service
```

In our verified Test deployment, the endpoint was:

```
10.244.235.166:8081
```

Test environment configuration:

| Setting          | Value                  |
| ---------------- | ---------------------- |
| Namespace        | micro-app-test         |
| ConfigMap        | external-postgres-user |
| Secret           | test-db-secret         |
| Database         | test_user_db           |
| Database user    | test_app               |
| Application port | 8081                   |

## 13. Deploy User Service in QA

The same Helm chart can be deployed into QA using its values file.

Run:

```
cd ~/Micro_App_Doc/helm/user-service
```

Install:

```
helm upgrade --install user-service . \
  --namespace micro-app-qa \
  -f values-qa.yaml
```

### 13.1 Verify Helm release

```
helm list -n micro-app-qa
```

### 13.2 Verify Kubernetes resources

```
kubectl get deployments,pods,services -n micro-app-qa
```

### 13.3 Check rollout

```
kubectl rollout status deployment/user-service \
  -n micro-app-qa --timeout=180s
```

### 13.4 Check application logs

```
kubectl logs deployment/user-service \
  -n micro-app-qa --tail=100
```

Look for:

```
Initialized JPA EntityManagerFactory
Tomcat started on port 8081
Started UserApplication
```

### 13.5 Verify Service endpoint

```
kubectl get endpointslice \
  -n micro-app-qa \
  -l kubernetes.io/service-name=user-service
```

Expected: a ready endpoint on port `8081`.

QA environment configuration:

| Setting          | Value                  |
| ---------------- | ---------------------- |
| Namespace        | micro-app-qa           |
| ConfigMap        | external-postgres-user |
| Secret           | qa-db-secret           |
| Database         | qa_user_db             |
| Database user    | qa_app                 |
| Application port | 8081                   |

## 14. Final Verification Across All Environments

### 14.1 Check Helm releases

```
helm list -n micro-app-dev

helm list -n micro-app-test

helm list -n micro-app-qa
```

Each environment should contain:

```
external-postgres
auth-service
user-service
```

### 14.2 Check User Service Deployments

```
kubectl get deployments -A | grep user-service
```

Expected:

```
micro-app-dev    user-service    1/1
micro-app-test   user-service    1/1
micro-app-qa     user-service    1/1
```

### 14.3 Check Pods

```
kubectl get pods -n micro-app-dev

kubectl get pods -n micro-app-test

kubectl get pods -n micro-app-qa
```

The User Service Pods should be `Running` and `Ready`.

### 14.4 Check Services

```
kubectl get services -A | grep user-service
```

Each namespace should contain a ClusterIP Service exposing port `8081`.

### 14.5 Check EndpointSlices

```
kubectl get endpointslice \
  -n micro-app-dev \
  -l kubernetes.io/service-name=user-service

kubectl get endpointslice \
  -n micro-app-test \
  -l kubernetes.io/service-name=user-service

kubectl get endpointslice \
  -n micro-app-qa \
  -l kubernetes.io/service-name=user-service
```

Each environment should have a ready User Service endpoint.

### 14.6 Check Helm history

```
helm history user-service -n micro-app-dev

helm history user-service -n micro-app-test

helm history user-service -n micro-app-qa
```

Each environment maintains its own release history.

## 15. Helm Upgrade and Rollback

Helm allows us to upgrade User Service independently in each environment.

### 15.1 Upgrade User Service in Dev

For example, when a new Docker image version becomes available:

```
helm upgrade user-service . \
  --namespace micro-app-dev \
  -f values-dev.yaml \
  --set image.tag=1.1.0
```

For repeatable deployments, update the image tag in the values file and commit the change to source control.

### 15.2 Check release history

```
helm history user-service -n micro-app-dev
```

### 15.3 Roll back to a previous revision

```
helm rollback user-service 1 \
  --namespace micro-app-dev
```

Replace `1` with the revision you actually want to restore.

Test and QA can be upgraded or rolled back independently.

## 16. Troubleshooting

### 16.1 Pod shows ImagePullBackOff

Check the Pod:

```
kubectl describe pods -n micro-app-dev \
  -l app.kubernetes.io/name=user-service
```

Possible reasons:

- Incorrect image name.
- Image tag does not exist.
- Registry authentication failure.
- Network connectivity issue.

### 16.2 Pod shows CreateContainerConfigError

Check the ConfigMap:

```
kubectl get configmap external-postgres-user \
  -n micro-app-dev
```

Check the Secret:

```
kubectl get secret dev-db-secret \
  -n micro-app-dev
```

The required keys are:

```
ConfigMap:
  SPRING_DATASOURCE_URL

Secret:
  DB_USERNAME
  DB_PASSWORD
```

### 16.3 Pod shows CrashLoopBackOff

Check application logs:

```
kubectl logs deployment/user-service \
  -n micro-app-dev --tail=100
```

For the previous container instance:

```
kubectl logs deployment/user-service \
  -n micro-app-dev --previous --tail=100
```

Look for:

- PostgreSQL connection failure.
- Incorrect database credentials.
- JDBC configuration errors.
- Application startup errors.

### 16.4 PostgreSQL Authentication Failure

Verify:

1. The correct environment Secret is referenced.
2. The database username matches the PostgreSQL user.
3. The password matches the database user's current password.
4. The database user has sufficient privileges.
5. PostgreSQL accepts connections from the Kubernetes network.

Do not print actual database passwords while troubleshooting.

### 16.5 Service Has No Endpoints

Check:

```
kubectl get pods -n micro-app-dev
```

Check the Service selector:

```
kubectl describe service user-service \
  -n micro-app-dev
```

Check EndpointSlices:

```
kubectl get endpointslice \
  -n micro-app-dev \
  -l kubernetes.io/service-name=user-service
```

Confirm that the Pod is Ready and that the Service selector matches its labels.

## 17. Important Implementation Notes

1. We use one reusable User Service Helm chart across Dev, Test and QA.
2. Each environment has an independent Helm release.
3. Each environment runs inside its own Kubernetes namespace.
4. We use `external-postgres-user` for the JDBC configuration.
5. We reuse existing Kubernetes database Secrets.
6. Passwords are not stored in Helm values files or ConfigMaps.
7. The application receives configuration through Kubernetes `valueFrom` references.
8. The external PostgreSQL server runs independently of the User Service chart.
9. The User Service Kubernetes Service is ClusterIP and exposes port `8081`.
10. Namespace values are passed during Helm installation rather than hardcoded in the templates.
11. ConfigMap changes consumed as environment variables require new application Pods to take effect.
12. The old in-cluster PostgreSQL resources should be removed only after every application has been migrated successfully.

## 18. Final Project Directory Structure

After completing the User Service Helm chart, our project structure will be:

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
    └── user-service/
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

## 19. Implementation Status

Based on the deployment and verification results:

| Component           | Dev         | Test         | QA                        |
| ------------------- | ----------- | ------------ | ------------------------- |
| Helm release        | Deployed    | Deployed     | Deployment to be verified |
| Deployment          | Ready       | Ready        | To be verified            |
| Pod                 | Running     | Running      | To be verified            |
| Service             | Created     | Created      | To be verified            |
| ConfigMap reference | Configured  | Configured   | Configured                |
| Secret reference    | Configured  | Configured   | Configured                |
| PostgreSQL database | dev_user_db | test_user_db | qa_user_db                |
| Application startup | Successful  | Successful   | To be verified            |

**Verified Dev endpoint:**

```
10.244.189.107:8081
```

**Verified Test endpoint:**

```
10.244.235.166:8081
```

QA deployment commands and verification procedures are included above; mark it completed after its rollout, logs and EndpointSlice have been checked.

## 20. Conclusion

We have converted the existing User Service Kubernetes manifests into a reusable Helm chart.

The same chart is used across Dev, Test and QA, with environment-specific configurations supplied through separate values files.

This implementation provides:

- Independent User Service deployment.
- Environment-specific PostgreSQL connections.
- Secure use of existing Kubernetes Secrets.
- Consistent deployment configuration.
- Independent Helm upgrades and rollbacks.
- Easier maintenance and future scaling.

**Next implementation:** Item Service Helm chart, followed by complete microservices validation across all environments.

**End of Article**

**Implementation note:** Your Dev and Test User Service deployments are verified successfully from the logs and EndpointSlices you shared. The QA section includes the complete deployment procedure, but QA is marked pending verification rather than assumed successful.
