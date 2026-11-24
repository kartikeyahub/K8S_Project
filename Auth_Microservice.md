# Deploy Auth Microservice Using Helm in Kubernetes – Dev, Test and QA

## 1. Introduction

In this implementation, we convert the existing Auth Service Kubernetes Deployment and Service YAML manifests into a reusable Helm chart.

We will deploy the Auth Service independently into three Kubernetes environments:

- Development
- Testing
- Quality Assurance

Each environment has its own namespace, PostgreSQL database, database user and Kubernetes Secret.

We will use one reusable Helm chart with separate environment-specific values files.

This allows us to deploy, upgrade and roll back the Auth Service independently in each environment.

## 2. Architecture Overview

### 2.1 Kubernetes Environment Configuration

| Environment | Namespace      | PostgreSQL Database | Database User |
| ----------- | -------------- | ------------------- | ------------- |
| Dev         | micro-app-dev  | dev_auth_db         | dev_app       |
| Test        | micro-app-test | test_auth_db        | test_app      |
| QA          | micro-app-qa   | qa_auth_db          | qa_app        |

### 2.2 Application Configuration

| Component          | Configuration                     |
| ------------------ | --------------------------------- |
| Application        | Auth Service                      |
| Docker Image       | kartikeyasoft/auth-service:latest |
| Container Port     | 8080                              |
| Kubernetes Service | ClusterIP                         |
| PostgreSQL Host    | 192.168.56.14                     |
| PostgreSQL Port    | 5432                              |
| Database ConfigMap | external-postgres-auth            |
| Dev Secret         | dev-db-secret                     |
| Test Secret        | test-db-secret                    |
| QA Secret          | qa-db-secret                      |

### 2.3 Architecture Diagram

```
                    Kubernetes Cluster
                            |
                   Auth Service Helm Chart
                            |
             +--------------+--------------+
             |              |              |
            Dev            Test            QA
             |              |              |
       micro-app-dev  micro-app-test  micro-app-qa
             |              |              |
       Auth Service   Auth Service   Auth Service
        Pod :8080      Pod :8080      Pod :8080
             |              |              |
       ConfigMap       ConfigMap       ConfigMap
       Secret          Secret          Secret
             |              |              |
             +--------------+--------------+
                            |
                      PostgreSQL
                    192.168.56.14
                       Port 5432
                            |
             +--------------+--------------+
             |              |              |
          dev_auth_db  test_auth_db    qa_auth_db
          dev_app      test_app        qa_app
```

## 3. Prerequisites

Before installing the Auth Service Helm chart, verify the following requirements.

### 3.1 Kubernetes Cluster

Check the Kubernetes nodes:

```
kubectl get nodes -o wide
```

All cluster nodes should be in the `Ready` state.

### 3.2 Helm Installation

Check the Helm version:

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

Our external PostgreSQL server is already running:

```
Host: 192.168.56.14
Port: 5432
```

The following databases must be available:

**Dev**

```
dev_auth_db
```

**Test**

```
test_auth_db
```

**QA**

```
qa_auth_db
```

The corresponding PostgreSQL users must have the necessary database privileges.

### 3.5 External PostgreSQL Helm Configuration

We have already deployed the `external-postgres` Helm chart in all three namespaces.

Verify:

```
helm list -n micro-app-dev
helm list -n micro-app-test
helm list -n micro-app-qa
```

Check the Auth ConfigMap in each namespace:

```
kubectl get configmap external-postgres-auth -n micro-app-dev

kubectl get configmap external-postgres-auth -n micro-app-test

kubectl get configmap external-postgres-auth -n micro-app-qa
```

The ConfigMap contains:

```
SPRING_DATASOURCE_URL
```

Expected database URLs:

| Environment | JDBC URL                                          |
| ----------- | ------------------------------------------------- |
| Dev         | jdbc:postgresql://192.168.56.14:5432/dev_auth_db  |
| Test        | jdbc:postgresql://192.168.56.14:5432/test_auth_db |
| QA          | jdbc:postgresql://192.168.56.14:5432/qa_auth_db   |

### 3.6 Kubernetes Database Secrets

We will reuse the existing database Secrets.

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

For Auth Service, we specifically use:

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

Do not expose or store actual database passwords in Helm values files or ConfigMaps.

## 4. Existing Kubernetes Auth Service Configuration

Before converting the existing Kubernetes manifests into a Helm chart, our original Auth Service Deployment was configured as follows.

File:

```
kubernetes/auth-service/deployment.yaml
```

Original configuration:

```
apiVersion: apps/v1
kind: Deployment

metadata:
  name: auth-service
  namespace: micro-app

spec:
  replicas: 1

  selector:
    matchLabels:
      app: auth-service

  template:
    metadata:
      labels:
        app: auth-service

    spec:
      containers:
        - name: auth-service

          image: kartikeyasoft/auth-service:latest

          imagePullPolicy: Always

          ports:
            - name: http
              containerPort: 8080

          env:
            - name: SERVER_PORT
              value: "8080"

            - name: SPRING_DATASOURCE_URL
              value: "jdbc:postgresql://postgres:5432/auth_db"

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

Notice that the previous configuration connected to the in-cluster PostgreSQL service:

```
jdbc:postgresql://postgres:5432/auth_db
```

We will replace this with the environment-specific external PostgreSQL ConfigMap.

We will also replace the old `postgres-secret` references with the existing environment-specific Secrets.

## 5. Create the Auth Service Helm Chart

Run the commands on the Kubernetes master node.

Go to the project directory:

```
cd ~/Micro_App_Doc
```

Create the Helm chart directory:

```
mkdir -p helm/auth-service/templates

cd helm/auth-service
```

### 5.1 Final Directory Structure

Our Auth Service Helm chart will have the following structure:

```
auth-service/
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

We will use the same Helm chart for all three environments.

## 6. Create Chart.yaml

File:

```
helm/auth-service/Chart.yaml
```

Configuration:

```
apiVersion: v2

name: auth-service

description: Helm chart for Auth microservice

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
helm/auth-service/values.yaml
```

This file contains the common application configuration.

```
replicaCount: 1

image:
  repository: kartikeyasoft/auth-service
  tag: latest
  pullPolicy: Always

containerPort: 8080

service:
  type: ClusterIP
  port: 8080

database:
  configMapName: external-postgres-auth
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

Explanation:

| Parameter               | Purpose                              |
| ----------------------- | ------------------------------------ |
| replicaCount            | Number of application replicas       |
| image.repository        | Docker image repository              |
| image.tag               | Docker image tag                     |
| image.pullPolicy        | Kubernetes image pull policy         |
| containerPort           | Application listening port           |
| service.type            | Kubernetes Service type              |
| database.configMapName  | Auth database ConfigMap              |
| database.existingSecret | Existing database Secret             |
| usernameKey             | Secret key for the database username |
| passwordKey             | Secret key for the database password |
| jpa.ddlAuto             | Hibernate schema management          |
| resources               | CPU and memory requests and limits   |
| probes                  | Application health-check settings    |

## 8. Create Environment-Specific Values Files

We will maintain separate configuration files for Dev, Test and QA.

### 8.1 Dev – values-dev.yaml

File:

```
helm/auth-service/values-dev.yaml
```

```
environment: dev

database:
  configMapName: external-postgres-auth
  existingSecret: dev-db-secret
```

Dev configuration:

```
Namespace: micro-app-dev

Database:
dev_auth_db

Database user:
dev_app

ConfigMap:
external-postgres-auth

Secret:
dev-db-secret
```

### 8.2 Test – values-test.yaml

File:

```
helm/auth-service/values-test.yaml
```

```
environment: test

database:
  configMapName: external-postgres-auth
  existingSecret: test-db-secret
```

Test configuration:

```
Namespace: micro-app-test

Database:
test_auth_db

Database user:
test_app

ConfigMap:
external-postgres-auth

Secret:
test-db-secret
```

### 8.3 QA – values-qa.yaml

File:

```
helm/auth-service/values-qa.yaml
```

```
environment: qa

database:
  configMapName: external-postgres-auth
  existingSecret: qa-db-secret
```

QA configuration:

```
Namespace: micro-app-qa

Database:
qa_auth_db

Database user:
qa_app

ConfigMap:
external-postgres-auth

Secret:
qa-db-secret
```

The ConfigMap name remains the same because it exists separately in each Kubernetes namespace.

The Secret changes depending on the target environment.

## 9. Create Helm Templates

### 9.1 Create \_helpers.tpl

File:

```
helm/auth-service/templates/_helpers.tpl
```

Configuration:

```
{{- define "auth-service.fullname" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{- define "auth-service.selectorLabels" -}}
app.kubernetes.io/name: auth-service
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "auth-service.labels" -}}
{{ include "auth-service.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
environment: {{ .Values.environment | default "unknown" | quote }}
{{- end }}
```

Explanation:

We use helper templates to generate common resource names and labels.

For this implementation, the Helm release name is:

```
auth-service
```

Therefore, the generated Kubernetes resources are:

```
Deployment: auth-service
Service: auth-service
```

### 9.2 Create deployment.yaml

File:

```
helm/auth-service/templates/deployment.yaml
```

Configuration:

```
apiVersion: apps/v1
kind: Deployment

metadata:
  name: {{ include "auth-service.fullname" . }}

  labels:
    {{- include "auth-service.labels" . | nindent 4 }}

spec:
  replicas: {{ .Values.replicaCount }}

  selector:
    matchLabels:
      {{- include "auth-service.selectorLabels" . | nindent 6 }}

  template:
    metadata:
      labels:
        {{- include "auth-service.labels" . | nindent 8 }}

    spec:
      containers:
        - name: auth-service

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

Important points:

**Database JDBC URL**

The Deployment reads this value from the environment-specific ConfigMap:

```
configMapKeyRef:
  name: external-postgres-auth
  key: SPRING_DATASOURCE_URL
```

**Database username**

The Deployment reads this value from the environment-specific Secret:

```
secretKeyRef:
  name: dev-db-secret
  key: DB_USERNAME
```

**Database password**

The Deployment reads this value from the same Secret:

```
secretKeyRef:
  name: dev-db-secret
  key: DB_PASSWORD
```

For Test and QA, Helm substitutes the relevant Secret names using their values files.

This ensures passwords are not included in the Deployment manifest as plain text.

### 9.3 Create service.yaml

File:

```
helm/auth-service/templates/service.yaml
```

Configuration:

```
apiVersion: v1
kind: Service

metadata:
  name: {{ include "auth-service.fullname" . }}

  labels:
    {{- include "auth-service.labels" . | nindent 4 }}

spec:
  type: {{ .Values.service.type }}

  selector:
    {{- include "auth-service.selectorLabels" . | nindent 4 }}

  ports:
    - name: http
      port: {{ .Values.service.port }}
      targetPort: http
      protocol: TCP
```

This creates a ClusterIP Service.

The Auth Service will be reachable inside the same Kubernetes cluster through:

```
http://auth-service:8080
```

### Namespace configuration

Notice that the Deployment and Service templates do not contain a hardcoded `metadata.namespace`.

This is intentional.

Helm automatically uses the namespace specified in the installation command.

For example:

```
--namespace micro-app-dev
```

The same Helm chart can therefore be reused in Dev, Test and QA without changing its templates.

## 10. Validate the Auth Service Helm Chart

Before deploying, validate the chart.

Go to:

```
cd ~/Micro_App_Doc/helm/auth-service
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
1 chart(s) linted, 0 chart(s) failed
```

### 10.3 Render Dev configuration

```
helm template auth-service . \
  --namespace micro-app-dev \
  -f values-dev.yaml
```

Verify the rendered Deployment contains:

```
name: external-postgres-auth
```

and:

```
name: dev-db-secret
```

It should also reference:

```
SPRING_DATASOURCE_URL
DB_USERNAME
DB_PASSWORD
```

The output should contain the Secret reference, not the actual database password.

### 10.4 Render Test configuration

```
helm template auth-service . \
  --namespace micro-app-test \
  -f values-test.yaml
```

Verify that the Secret reference is:

```
test-db-secret
```

### 10.5 Render QA configuration

```
helm template auth-service . \
  --namespace micro-app-qa \
  -f values-qa.yaml
```

Verify that the Secret reference is:

```
qa-db-secret
```

These commands render YAML without deploying the application.

## 11. Deploy Auth Service in Dev

After validation, deploy the Auth Service in the Dev namespace.

Run:

```
cd ~/Micro_App_Doc/helm/auth-service
```

Install the chart:

```
helm upgrade --install auth-service . \
  --namespace micro-app-dev \
  -f values-dev.yaml
```

Expected:

```
NAME: auth-service
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
```

### 11.2 Verify Kubernetes resources

```
kubectl get deployment,pods,services -n micro-app-dev
```

Expected Deployment:

```
deployment.apps/auth-service   1/1   1   1
```

### 11.3 Verify Pod status

```
kubectl get pods -n micro-app-dev -o wide
```

Expected:

```
READY   STATUS
1/1     Running
```

### 11.4 Check rollout

```
kubectl rollout status deployment/auth-service \
  -n micro-app-dev --timeout=180s
```

Expected:

```
deployment "auth-service" successfully rolled out
```

### 11.5 Check application logs

```
kubectl logs deployment/auth-service \
  -n micro-app-dev --tail=100
```

Look for successful Spring Boot startup.

The actual Dev implementation produced startup logs confirming:

```
Tomcat started on port 8080
Started AuthApplication
```

### 11.6 Verify Service endpoint

```
kubectl get endpointslice \
  -n micro-app-dev \
  -l kubernetes.io/service-name=auth-service
```

The EndpointSlice should contain the Auth Pod IP and port `8080`.

This confirms that the Service has a ready backend endpoint.

## 12. Deploy Auth Service in Test

Now deploy the same Helm chart in Test.

Run:

```
cd ~/Micro_App_Doc/helm/auth-service
```

Install:

```
helm upgrade --install auth-service . \
  --namespace micro-app-test \
  -f values-test.yaml
```

### 12.1 Verify Helm release

```
helm list -n micro-app-test
```

### 12.2 Verify Deployment and Pods

```
kubectl get deployment,pods,services -n micro-app-test
```

### 12.3 Check rollout

```
kubectl rollout status deployment/auth-service \
  -n micro-app-test --timeout=180s
```

### 12.4 Check application logs

```
kubectl logs deployment/auth-service \
  -n micro-app-test --tail=100
```

### 12.5 Verify Service endpoint

```
kubectl get endpointslice \
  -n micro-app-test \
  -l kubernetes.io/service-name=auth-service
```

Test environment configuration:

| Setting          | Value                  |
| ---------------- | ---------------------- |
| Namespace        | micro-app-test         |
| ConfigMap        | external-postgres-auth |
| Secret           | test-db-secret         |
| Database         | test_auth_db           |
| Database user    | test_app               |
| Application port | 8080                   |

## 13. Deploy Auth Service in QA

Finally, deploy Auth Service in QA.

Run:

```
cd ~/Micro_App_Doc/helm/auth-service
```

Install:

```
helm upgrade --install auth-service . \
  --namespace micro-app-qa \
  -f values-qa.yaml
```

### 13.1 Verify Helm release

```
helm list -n micro-app-qa
```

### 13.2 Verify Deployment and Pods

```
kubectl get deployment,pods,services -n micro-app-qa
```

### 13.3 Check rollout

```
kubectl rollout status deployment/auth-service \
  -n micro-app-qa --timeout=180s
```

### 13.4 Check application logs

```
kubectl logs deployment/auth-service \
  -n micro-app-qa --tail=100
```

### 13.5 Verify Service endpoint

```
kubectl get endpointslice \
  -n micro-app-qa \
  -l kubernetes.io/service-name=auth-service
```

QA environment configuration:

| Setting          | Value                  |
| ---------------- | ---------------------- |
| Namespace        | micro-app-qa           |
| ConfigMap        | external-postgres-auth |
| Secret           | qa-db-secret           |
| Database         | qa_auth_db             |
| Database user    | qa_app                 |
| Application port | 8080                   |

## 14. Final Verification Across All Environments

### 14.1 Check Helm releases

```
helm list -n micro-app-dev

helm list -n micro-app-test

helm list -n micro-app-qa
```

Every environment should contain:

```
auth-service
external-postgres
```

### 14.2 Check Auth Deployments

```
kubectl get deployments -A | grep auth-service
```

Expected:

```
micro-app-dev    auth-service    1/1
micro-app-test   auth-service    1/1
micro-app-qa     auth-service    1/1
```

### 14.3 Check Pods

```
kubectl get pods -n micro-app-dev

kubectl get pods -n micro-app-test

kubectl get pods -n micro-app-qa
```

The Auth Service Pods should be `Running` and `Ready`.

### 14.4 Check Services

```
kubectl get services -A | grep auth-service
```

Each namespace should have its own ClusterIP Service exposing port `8080`.

### 14.5 Check Helm history

```
helm history auth-service -n micro-app-dev

helm history auth-service -n micro-app-test

helm history auth-service -n micro-app-qa
```

This shows the release revisions for each environment independently.

## 15. Helm Upgrade and Rollback

Helm makes it easy to update the Auth Service without manually applying Kubernetes YAML.

### 15.1 Upgrade Auth Service in Dev

For example, when the Docker image tag changes:

```
helm upgrade auth-service . \
  --namespace micro-app-dev \
  -f values-dev.yaml \
  --set image.tag=1.1.0
```

The chart applies the new image configuration to the Dev Deployment.

For repeatable production workflows, prefer updating the relevant values file and committing that change to source control rather than relying solely on command-line overrides.

### 15.2 Check release history

```
helm history auth-service -n micro-app-dev
```

### 15.3 Rollback to a previous revision

```
helm rollback auth-service 1 \
  --namespace micro-app-dev
```

Replace `1` with the revision you actually want to restore.

Test and QA can be upgraded or rolled back independently.

## 16. Troubleshooting

### 16.1 Pod shows ImagePullBackOff

Check:

```
kubectl describe pod -n micro-app-dev \
  -l app.kubernetes.io/name=auth-service
```

Possible reasons:

- Incorrect Docker image name.
- Image tag does not exist.
- Registry authentication failure.
- Network connectivity issue.

### 16.2 Pod shows CreateContainerConfigError

Check the ConfigMap and Secret:

```
kubectl get configmap external-postgres-auth \
  -n micro-app-dev

kubectl get secret dev-db-secret \
  -n micro-app-dev
```

Verify the required keys:

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
kubectl logs deployment/auth-service \
  -n micro-app-dev --tail=100
```

For the previous container instance:

```
kubectl logs deployment/auth-service \
  -n micro-app-dev --previous --tail=100
```

Check for:

- Database connection failures.
- Incorrect credentials.
- JDBC configuration errors.
- Application startup errors.

### 16.4 PostgreSQL authentication failure

Verify:

1. The correct environment Secret is referenced.
2. The Secret username matches the PostgreSQL database user.
3. The Secret password matches the current PostgreSQL password.
4. The database user has the required privileges.
5. PostgreSQL accepts connections from the Kubernetes node network.

Do not display passwords while troubleshooting.

### 16.5 Pod is Running but Deployment is Not Ready

Check:

```
kubectl describe deployment auth-service \
  -n micro-app-dev
```

Check Pod readiness:

```
kubectl get pods -n micro-app-dev
```

Inspect startup, readiness and liveness probe events.

The existing health checks use TCP port `8080`.

## 17. Important Implementation Notes

1. We use one reusable Auth Service Helm chart across three environments.
2. Each environment has an independent Helm release.
3. Each environment uses its own Kubernetes namespace.
4. We use `external-postgres-auth` for the Auth Service JDBC connection.
5. We reuse the existing Kubernetes database Secrets.
6. Database passwords are never placed in Helm values or ConfigMaps.
7. The Auth Service Deployment receives database configuration using `valueFrom`.
8. The PostgreSQL server is external and is not created by this Auth Service chart.
9. The Kubernetes Service is a ClusterIP service and exposes port `8080`.
10. The chart does not hardcode a namespace. Helm uses the namespace passed during installation.
11. Updating a ConfigMap used through environment variables requires new application Pods before the changed value takes effect.
12. The old in-cluster PostgreSQL resources should only be removed after all applications have been migrated successfully.

## 18. Final Project Structure

After completing the Auth Service implementation, our Helm directory looks like this:

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
    └── auth-service/
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

## 19. Final Implementation Status

The Auth Service has been deployed and verified in all three environments.

| Component           | Dev         | Test         | QA         |
| ------------------- | ----------- | ------------ | ---------- |
| Helm release        | Deployed    | Deployed     | Deployed   |
| Deployment          | Ready       | Ready        | Ready      |
| Pod                 | Running     | Running      | Running    |
| Service             | Created     | Created      | Created    |
| ConfigMap reference | Verified    | Verified     | Verified   |
| Secret reference    | Configured  | Configured   | Configured |
| PostgreSQL database | dev_auth_db | test_auth_db | qa_auth_db |
| Application startup | Successful  | Successful   | Successful |

The Dev deployment was verified with Spring Boot startup logs showing Tomcat listening on port `8080` and a ready Kubernetes Service endpoint.

Test and QA deployments were also completed successfully.

## 20. Conclusion

We have successfully converted the existing Auth Service Kubernetes manifests into an independent Helm chart and deployed it across Dev, Test and QA.

The main advantage of this approach is that the same Helm chart can be reused for multiple environments while maintaining environment-specific configuration through separate values files.

This provides:

- Independent application deployment.
- Environment-specific database configuration.
- Secure use of existing Kubernetes Secrets.
- Independent upgrades and rollbacks.
- Consistent application deployment across environments.
- Easier maintenance as the microservices project grows.

**Next implementation:** User Service Helm chart, followed by Item Service Helm chart.

**End of Article**

The article documents the three successful Auth deployments and keeps the external PostgreSQL chart and Auth Service chart as separate Helm releases.
