I've prepared the complete step-by-step article based on the Helm chart we built and successfully tested in Dev, Test and QA. It includes the folder structure, every chart file, commands, deployment, validation, database connectivity tests and application integration.

# External PostgreSQL Configuration Using Helm on Kubernetes – Dev, Test and QA

## 1. Introduction

In this implementation, we configure an external PostgreSQL database server for Kubernetes applications using Helm.

Instead of deploying PostgreSQL inside Kubernetes using a StatefulSet, we use an independently managed PostgreSQL server running on an Ubuntu VirtualBox VM.

Helm manages the database connection configuration for three Kubernetes environments:

- Development
- Testing
- Quality Assurance

Each environment has its own Kubernetes namespace, PostgreSQL database users, databases, ConfigMaps and Secrets.

### 1.1 Architecture

**External PostgreSQL server**

| Component          | Value         |
| ------------------ | ------------- |
| Server             | testdb        |
| Operating System   | Ubuntu        |
| IP address         | 192.168.56.14 |
| PostgreSQL port    | 5432          |
| PostgreSQL version | 16            |

**Kubernetes environment configuration**

| Environment | Namespace      | Database user | Databases                                |
| ----------- | -------------- | ------------- | ---------------------------------------- |
| Dev         | micro-app-dev  | dev_app       | dev_auth_db, dev_user_db, dev_item_db    |
| Test        | micro-app-test | test_app      | test_auth_db, test_user_db, test_item_db |
| QA          | micro-app-qa   | qa_app        | qa_auth_db, qa_user_db, qa_item_db       |

All three environments connect to the same external PostgreSQL server, but use separate databases and users.

### 1.2 Architecture diagram

```
                 Kubernetes Cluster
                         |
                  Helm Deployment
                         |
                 external-postgres
                         |
          +--------------+--------------+
          |              |              |
       Dev Release    Test Release    QA Release
          |              |              |
    micro-app-dev  micro-app-test  micro-app-qa
          |              |              |
     ConfigMaps      ConfigMaps      ConfigMaps
     Secrets         Secrets         Secrets
          |              |              |
          +--------------+--------------+
                         |
                  TCP Port 5432
                         |
             External PostgreSQL Server
                  192.168.56.14
                         |
          +--------------+--------------+
          |              |              |
         Dev            Test            QA
       Databases      Databases      Databases
```

## 2. Prerequisites

Before creating the Helm chart, ensure the following are available.

### 2.1 External PostgreSQL

PostgreSQL must already be running on:

```
192.168.56.14:5432
```

The following databases and users must already exist:

**Dev**

```
User: dev_app

Databases:
  dev_auth_db
  dev_user_db
  dev_item_db
```

**Test**

```
User: test_app

Databases:
  test_auth_db
  test_user_db
  test_item_db
```

**QA**

```
User: qa_app

Databases:
  qa_auth_db
  qa_user_db
  qa_item_db
```

Each environment's database user must have the required privileges on all three databases belonging to that environment.

### 2.2 Kubernetes namespaces

Check the namespaces:

```
kubectl get namespaces
```

Expected:

```
micro-app-dev
micro-app-test
micro-app-qa
```

Create any missing namespaces:

```
kubectl create namespace micro-app-dev
kubectl create namespace micro-app-test
kubectl create namespace micro-app-qa
```

These commands are only needed for namespaces that do not already exist.

### 2.3 Kubernetes database Secrets

We use existing Kubernetes Secrets to store the database credentials.

| Namespace      | Secret name    |
| -------------- | -------------- |
| micro-app-dev  | dev-db-secret  |
| micro-app-test | test-db-secret |
| micro-app-qa   | qa-db-secret   |

Every Secret contains these five keys:

```
DB_HOST
DB_PORT
DB_NAME
DB_USERNAME
DB_PASSWORD
```

For example, the Dev configuration contains:

```
DB_HOST=192.168.56.14
DB_PORT=5432
DB_NAME=dev_item_db
DB_USERNAME=dev_app
DB_PASSWORD=<stored securely>
```

Check the Secrets:

```
kubectl get secrets -n micro-app-dev
kubectl get secrets -n micro-app-test
kubectl get secrets -n micro-app-qa
```

Check the key names without revealing their values:

```
kubectl get secret dev-db-secret -n micro-app-dev \
  -o go-template='{{range $k, $v := .data}}{{printf "%s\n" $k}}{{end}}'
```

Repeat with `test-db-secret` and `qa-db-secret` in their respective namespaces.

**Important:** Do not store database passwords inside Helm values files or ConfigMaps. Reuse Kubernetes Secrets or an approved secrets-management solution.

## 3. Create the Helm Chart

We will create one reusable Helm chart named:

```
external-postgres
```

The same chart will be installed separately into Dev, Test and QA.

### 3.1 Create the directory structure

Run on the Kubernetes master node:

```
cd ~/Micro_App_Doc

mkdir -p helm/external-postgres/templates

cd helm/external-postgres
```

The final directory structure is:

```
external-postgres/
│
├── Chart.yaml
│
├── values.yaml
├── values-dev.yaml
├── values-test.yaml
├── values-qa.yaml
│
└── templates/
    ├── NOTES.txt
    ├── _helpers.tpl
    ├── auth-configmap.yaml
    ├── item-configmap.yaml
    └── user-configmap.yaml
```

### 3.2 Create Chart.yaml

File: `Chart.yaml`

```
apiVersion: v2

name: external-postgres

description: External PostgreSQL connection configuration for microservices

type: application

version: 0.1.0

appVersion: "16"
```

Explanation:

| Field       | Description                             |
| ----------- | --------------------------------------- |
| apiVersion  | Helm chart API version                  |
| name        | Chart name                              |
| description | Purpose of the chart                    |
| type        | Application chart                       |
| version     | Helm chart version                      |
| appVersion  | Referenced application version metadata |

This chart does not install PostgreSQL version 16. The `appVersion` field is metadata; our PostgreSQL server runs independently.

## 4. Create values.yaml

File: `values.yaml`

```
environment: dev

database:
  host: "192.168.56.14"
  port: 5432

  authDatabase: "dev_auth_db"
  userDatabase: "dev_user_db"
  itemDatabase: "dev_item_db"

existingSecret: "dev-db-secret"
```

This file provides the default configuration for the chart.

The chart uses these values to generate the PostgreSQL JDBC connection URLs.

## 5. Create Environment-Specific Values Files

We use separate values files so the same chart can be deployed into multiple environments without modifying the templates.

### 5.1 Dev – values-dev.yaml

```
environment: dev

database:
  host: "192.168.56.14"
  port: 5432

  authDatabase: "dev_auth_db"
  userDatabase: "dev_user_db"
  itemDatabase: "dev_item_db"

existingSecret: "dev-db-secret"
```

### 5.2 Test – values-test.yaml

```
environment: test

database:
  host: "192.168.56.14"
  port: 5432

  authDatabase: "test_auth_db"
  userDatabase: "test_user_db"
  itemDatabase: "test_item_db"

existingSecret: "test-db-secret"
```

### 5.3 QA – values-qa.yaml

```
environment: qa

database:
  host: "192.168.56.14"
  port: 5432

  authDatabase: "qa_auth_db"
  userDatabase: "qa_user_db"
  itemDatabase: "qa_item_db"

existingSecret: "qa-db-secret"
```

The three files use the same PostgreSQL server but different databases and Secrets.

## 6. Create Helm Templates

The templates define which Kubernetes resources Helm creates.

For this implementation, Helm creates three ConfigMaps per environment:

1. Auth Service database configuration.
2. User Service database configuration.
3. Item Service database configuration.

The existing Kubernetes Secrets are reused and are not recreated by this chart.

### 6.1 Create \_helpers.tpl

File: `templates/_helpers.tpl`

```
{{- define "external-postgres.fullname" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{- define "external-postgres.labels" -}}
app.kubernetes.io/name: external-postgres
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
environment: {{ .Values.environment | quote }}
{{- end }}
```

Explanation:

The helper templates avoid repeating common resource names and labels.

For example:

```
external-postgres-auth
external-postgres-user
external-postgres-item
```

The names are based on the Helm release name.

### 6.2 Create Auth Service ConfigMap

File: `templates/auth-configmap.yaml`

```
apiVersion: v1
kind: ConfigMap

metadata:
  name: {{ include "external-postgres.fullname" . }}-auth

  labels:
    {{- include "external-postgres.labels" . | nindent 4 }}

data:
  SPRING_DATASOURCE_URL: {{ printf "jdbc:postgresql://%s:%v/%s" .Values.database.host .Values.database.port .Values.database.authDatabase | quote }}
```

This template generates the Auth Service JDBC URL.

Example for Dev:

```
jdbc:postgresql://192.168.56.14:5432/dev_auth_db
```

### 6.3 Create User Service ConfigMap

File: `templates/user-configmap.yaml`

```
apiVersion: v1
kind: ConfigMap

metadata:
  name: {{ include "external-postgres.fullname" . }}-user

  labels:
    {{- include "external-postgres.labels" . | nindent 4 }}

data:
  SPRING_DATASOURCE_URL: {{ printf "jdbc:postgresql://%s:%v/%s" .Values.database.host .Values.database.port .Values.database.userDatabase | quote }}
```

This template generates the User Service JDBC URL.

Example for Dev:

```
jdbc:postgresql://192.168.56.14:5432/dev_user_db
```

### 6.4 Create Item Service ConfigMap

File: `templates/item-configmap.yaml`

```
apiVersion: v1
kind: ConfigMap

metadata:
  name: {{ include "external-postgres.fullname" . }}-item

  labels:
    {{- include "external-postgres.labels" . | nindent 4 }}

data:
  SPRING_DATASOURCE_URL: {{ printf "jdbc:postgresql://%s:%v/%s" .Values.database.host .Values.database.port .Values.database.itemDatabase | quote }}
```

This template generates the Item Service JDBC URL.

Example for Dev:

```
jdbc:postgresql://192.168.56.14:5432/dev_item_db
```

### 6.5 Create NOTES.txt

File: `templates/NOTES.txt`

```
External PostgreSQL configuration installed.

Environment: {{ .Values.environment }}
PostgreSQL Host: {{ .Values.database.host }}
PostgreSQL Port: {{ .Values.database.port }}

Existing credentials Secret: {{ .Values.existingSecret }}

ConfigMaps:
  {{ include "external-postgres.fullname" . }}-auth
  {{ include "external-postgres.fullname" . }}-user
  {{ include "external-postgres.fullname" . }}-item

The application Deployments must reference the corresponding ConfigMap
and map DB_USERNAME and DB_PASSWORD from the existing Secret to:
  SPRING_DATASOURCE_USERNAME
  SPRING_DATASOURCE_PASSWORD
```

NOTES.txt displays installation information after Helm installation.

## 7. Validate the Helm Chart

Before installing the chart, validate its structure and templates.

Run from:

```
cd ~/Micro_App_Doc/helm/external-postgres
```

### 7.1 Check the directory structure

```
find . -maxdepth 2 -type f | sort
```

### 7.2 Run Helm lint

```
helm lint .
```

Expected:

```
==> Linting .
[INFO] Chart.yaml: icon is recommended

1 chart(s) linted, 0 chart(s) failed
```

The icon message is only a recommendation. It does not indicate a chart validation failure.

### 7.3 Render the Dev templates

```
helm template external-postgres . \
  --namespace micro-app-dev \
  -f values-dev.yaml
```

Expected database URLs:

```
jdbc:postgresql://192.168.56.14:5432/dev_auth_db

jdbc:postgresql://192.168.56.14:5432/dev_user_db

jdbc:postgresql://192.168.56.14:5432/dev_item_db
```

The render command does not create Kubernetes resources. It only displays the generated YAML.

## 8. Deploy Helm Chart in Dev

Once the chart passes validation, install it in the Dev namespace.

Run:

```
cd ~/Micro_App_Doc/helm/external-postgres

helm upgrade --install external-postgres . \
  --namespace micro-app-dev \
  -f values-dev.yaml
```

Expected:

```
NAME: external-postgres
NAMESPACE: micro-app-dev
STATUS: deployed
```

### 8.1 Verify the Helm release

```
helm list -n micro-app-dev

helm status external-postgres -n micro-app-dev
```

### 8.2 Verify ConfigMaps

```
kubectl get configmaps -n micro-app-dev
```

Expected:

```
external-postgres-auth
external-postgres-user
external-postgres-item
```

### 8.3 Verify Auth database URL

```
kubectl get configmap external-postgres-auth \
  -n micro-app-dev \
  -o jsonpath='{.data.SPRING_DATASOURCE_URL}{"\n"}'
```

Expected:

```
jdbc:postgresql://192.168.56.14:5432/dev_auth_db
```

### 8.4 Verify User database URL

```
kubectl get configmap external-postgres-user \
  -n micro-app-dev \
  -o jsonpath='{.data.SPRING_DATASOURCE_URL}{"\n"}'
```

Expected:

```
jdbc:postgresql://192.168.56.14:5432/dev_user_db
```

### 8.5 Verify Item database URL

```
kubectl get configmap external-postgres-item \
  -n micro-app-dev \
  -o jsonpath='{.data.SPRING_DATASOURCE_URL}{"\n"}'
```

Expected:

```
jdbc:postgresql://192.168.56.14:5432/dev_item_db
```

### 8.6 Verify the existing Secret

```
kubectl get secret dev-db-secret -n micro-app-dev
```

The Secret should remain present with five data keys.

## 9. Test Actual Dev Database Connectivity

ConfigMap verification confirms the connection URLs. We must also test actual network connectivity and database authentication from a Kubernetes Pod.

### 9.1 Create a temporary PostgreSQL client Pod

File: `/tmp/dev-db-connectivity-test.yaml`

```
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

            echo "================================"
            echo "Testing database: $db"
            echo "================================"

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

Apply the Pod:

```
kubectl apply -f /tmp/dev-db-connectivity-test.yaml
```

Check its status:

```
kubectl get pod dev-db-connectivity-test -n micro-app-dev -w
```

Wait until it reaches `Completed`.

Press `Ctrl+C` after the status changes.

### 9.2 Check test logs

```
kubectl logs dev-db-connectivity-test -n micro-app-dev
```

Expected results:

```
Testing database: dev_auth_db

dev_auth_db | dev_app

Testing database: dev_user_db

dev_user_db | dev_app

Testing database: dev_item_db

dev_item_db | dev_app
```

This confirms that the Pod can connect to all three databases using the Dev database credentials.

### 9.3 Remove the temporary Pod

```
kubectl delete pod dev-db-connectivity-test \
  -n micro-app-dev

rm -f /tmp/dev-db-connectivity-test.yaml
```

## 10. Deploy Helm Chart in Test

We reuse the same Helm chart.

Only the namespace and values file change.

Run:

```
cd ~/Micro_App_Doc/helm/external-postgres

helm upgrade --install external-postgres . \
  --namespace micro-app-test \
  -f values-test.yaml
```

### 10.1 Verify release

```
helm list -n micro-app-test

helm status external-postgres -n micro-app-test
```

### 10.2 Verify ConfigMaps

```
kubectl get configmaps -n micro-app-test
```

Expected database URLs:

```
jdbc:postgresql://192.168.56.14:5432/test_auth_db

jdbc:postgresql://192.168.56.14:5432/test_user_db

jdbc:postgresql://192.168.56.14:5432/test_item_db
```

### 10.3 Test Test database connectivity

Create `/tmp/test-db-connectivity.yaml`:

```
apiVersion: v1
kind: Pod

metadata:
  name: test-db-connectivity
  namespace: micro-app-test

spec:
  restartPolicy: Never

  containers:
    - name: postgres-client

      image: postgres:16

      command: ["/bin/sh", "-c"]

      args:
        - |
          set -eu

          for db in test_auth_db test_user_db test_item_db; do

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
            name: test-db-secret
```

Apply and check:

```
kubectl apply -f /tmp/test-db-connectivity.yaml

kubectl get pod test-db-connectivity -n micro-app-test -w
```

After it reaches `Completed`:

```
kubectl logs test-db-connectivity -n micro-app-test
```

Expected:

```
test_auth_db | test_app
test_user_db | test_app
test_item_db | test_app
```

Remove the test Pod:

```
kubectl delete pod test-db-connectivity \
  -n micro-app-test

rm -f /tmp/test-db-connectivity.yaml
```

## 11. Deploy Helm Chart in QA

Install the same chart using the QA values file.

```
cd ~/Micro_App_Doc/helm/external-postgres

helm upgrade --install external-postgres . \
  --namespace micro-app-qa \
  -f values-qa.yaml
```

### 11.1 Verify Helm release

```
helm list -n micro-app-qa

helm status external-postgres -n micro-app-qa
```

### 11.2 Verify ConfigMaps

```
kubectl get configmaps -n micro-app-qa
```

Expected database URLs:

```
jdbc:postgresql://192.168.56.14:5432/qa_auth_db

jdbc:postgresql://192.168.56.14:5432/qa_user_db

jdbc:postgresql://192.168.56.14:5432/qa_item_db
```

### 11.3 Test QA database connectivity

Create `/tmp/qa-db-connectivity.yaml`:

```
apiVersion: v1
kind: Pod

metadata:
  name: qa-db-connectivity
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

          for db in qa_auth_db qa_user_db qa_item_db; do

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
            name: qa-db-secret
```

Apply:

```
kubectl apply -f /tmp/qa-db-connectivity.yaml
```

Wait until the Pod completes:

```
kubectl get pod qa-db-connectivity -n micro-app-qa -w
```

Check the logs:

```
kubectl logs qa-db-connectivity -n micro-app-qa
```

Expected:

```
qa_auth_db | qa_app
qa_user_db | qa_app
qa_item_db | qa_app
```

Remove the temporary Pod:

```
kubectl delete pod qa-db-connectivity \
  -n micro-app-qa

rm -f /tmp/qa-db-connectivity.yaml
```

## 12. How Application Deployments Use These ConfigMaps and Secrets

The external-postgres Helm chart creates the database URL ConfigMaps. Application Deployments must reference the matching ConfigMap and Secret.

For example, Dev Auth Service:

```
env:
  - name: SPRING_DATASOURCE_URL
    valueFrom:
      configMapKeyRef:
        name: external-postgres-auth
        key: SPRING_DATASOURCE_URL

  - name: SPRING_DATASOURCE_USERNAME
    valueFrom:
      secretKeyRef:
        name: dev-db-secret
        key: DB_USERNAME

  - name: SPRING_DATASOURCE_PASSWORD
    valueFrom:
      secretKeyRef:
        name: dev-db-secret
        key: DB_PASSWORD
```

The other two services use their respective ConfigMaps:

| Service      | ConfigMap              |
| ------------ | ---------------------- |
| Auth Service | external-postgres-auth |
| User Service | external-postgres-user |
| Item Service | external-postgres-item |

For Test and QA, change the Secret name to `test-db-secret` or `qa-db-secret`, respectively.

The Spring Boot application can consume these environment variables through its datasource configuration.

Example:

```
spring.datasource.url=${SPRING_DATASOURCE_URL}
spring.datasource.username=${SPRING_DATASOURCE_USERNAME}
spring.datasource.password=${SPRING_DATASOURCE_PASSWORD}

spring.datasource.driver-class-name=org.postgresql.Driver

spring.jpa.hibernate.ddl-auto=update
```

Do not put actual passwords in `application.properties`, ConfigMaps or Helm values files.

**Important:** Creating ConfigMaps does not automatically update application Deployments. The application Helm charts must explicitly reference these ConfigMaps and Secrets. Also, changes to ConfigMaps consumed as environment variables require a Pod restart or Deployment rollout to take effect.

## 13. Helm Release Management

Each environment has its own Helm release, even though the release name is the same.

| Environment | Namespace      | Helm release      |
| ----------- | -------------- | ----------------- |
| Dev         | micro-app-dev  | external-postgres |
| Test        | micro-app-test | external-postgres |
| QA          | micro-app-qa   | external-postgres |

### 13.1 List Helm releases

```
helm list -n micro-app-dev
helm list -n micro-app-test
helm list -n micro-app-qa
```

### 13.2 Check a Helm release

```
helm status external-postgres -n micro-app-dev
```

Change the namespace to inspect Test or QA.

### 13.3 Upgrade the Dev configuration

When values or templates change:

```
helm upgrade external-postgres . \
  --namespace micro-app-dev \
  -f values-dev.yaml
```

For a command that works for both initial installation and subsequent updates, use:

```
helm upgrade --install external-postgres . \
  --namespace micro-app-dev \
  -f values-dev.yaml
```

### 13.4 Render templates without deploying

```
helm template external-postgres . \
  --namespace micro-app-dev \
  -f values-dev.yaml
```

### 13.5 Roll back a Helm release

First check the revision history:

```
helm history external-postgres -n micro-app-dev
```

Then roll back to the desired revision:

```
helm rollback external-postgres 1 \
  --namespace micro-app-dev
```

Use the actual revision number from the release history.

## 14. Final Verification

Check all three Helm releases:

```
helm list -n micro-app-dev

helm list -n micro-app-test

helm list -n micro-app-qa
```

Check the ConfigMaps:

```
kubectl get configmaps -n micro-app-dev

kubectl get configmaps -n micro-app-test

kubectl get configmaps -n micro-app-qa
```

Check the Secrets:

```
kubectl get secrets -n micro-app-dev

kubectl get secrets -n micro-app-test

kubectl get secrets -n micro-app-qa
```

### Final implementation status

| Component            | Dev      | Test     | QA       |
| -------------------- | -------- | -------- | -------- |
| Helm release         | Deployed | Deployed | Deployed |
| Auth ConfigMap       | Created  | Created  | Created  |
| User ConfigMap       | Created  | Created  | Created  |
| Item ConfigMap       | Created  | Created  | Created  |
| Database Secret      | Existing | Existing | Existing |
| Auth DB connectivity | Passed   | Passed   | Passed   |
| User DB connectivity | Passed   | Passed   | Passed   |
| Item DB connectivity | Passed   | Passed   | Passed   |

All three environments have been successfully configured and their connectivity has been tested from Kubernetes.

## 15. Important Architecture Notes

1. The external PostgreSQL server runs independently on `192.168.56.14:5432`.
2. This Helm chart does not install PostgreSQL or create databases and users. Those are managed on the external database server.
3. This chart creates three Kubernetes ConfigMaps per environment.
4. Database credentials remain in existing Kubernetes Secrets.
5. Application Deployment charts must reference the correct ConfigMaps and Secrets.
6. Each environment has a separate namespace and Helm release.
7. The same Helm chart is reused with different values files.
8. The existing in-cluster PostgreSQL StatefulSet should only be removed after all applications have been migrated away from it.

## Conclusion

We have implemented a reusable Helm chart for external PostgreSQL connectivity across Dev, Test and QA.

Instead of maintaining separate Kubernetes database configuration YAML files for every environment, we manage the connection URLs through one reusable Helm chart and environment-specific values files.

This approach provides centralized configuration, independent environment management, reusable templates and easier future maintenance as additional microservices and environments are introduced.

**Project structure:**

```
Micro_App_Doc/
│
├── helm/
│   │
│   └── external-postgres/
│       ├── Chart.yaml
│       ├── values.yaml
│       ├── values-dev.yaml
│       ├── values-test.yaml
│       ├── values-qa.yaml
│       │
│       └── templates/
│           ├── NOTES.txt
│           ├── _helpers.tpl
│           ├── auth-configmap.yaml
│           ├── user-configmap.yaml
│           └── item-configmap.yaml
│
└── kubernetes/
    ├── auth-service/
    ├── user-service/
    ├── item-service/
    └── frontend/
```

**End of Article**

This article reflects the implementation you tested successfully. One important distinction is documented throughout: `external-postgres` manages connection ConfigMaps, not the PostgreSQL server or database credentials themselves.
