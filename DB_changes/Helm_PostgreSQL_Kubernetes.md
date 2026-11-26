# External PostgreSQL Configuration Using Helm on Kubernetes

**Environments:** Dev, Test and QA\
**Helm chart:** `external-postgres`\
**PostgreSQL server:** External Ubuntu VM (`192.168.56.14:5432`)\
**PostgreSQL version:** 16

------------------------------------------------------------------------

## 1. Overview

This project configures Kubernetes microservices to connect to an
independently managed PostgreSQL server outside the Kubernetes cluster.

Instead of running PostgreSQL inside Kubernetes for these environments,
the database server runs on an Ubuntu VirtualBox VM. Helm manages the
connection configuration consumed by the Auth, User and Item services.

The same reusable Helm chart is deployed separately into the Dev, Test
and QA namespaces. Each environment has its own database names, database
user, Kubernetes Secret and Helm release.

### What this Helm chart does

-   Creates three ConfigMaps per environment: Auth, User and Item.
-   Reads database connection details from the environment-specific Helm
    values file.
-   Places the database host and port in the generated ConfigMaps.
-   Generates a service-specific PostgreSQL JDBC URL in each ConfigMap.
-   Uses existing Kubernetes Secrets for database credentials; it does
    not create or modify those Secrets.

### What this Helm chart does not do

-   It does not install or run PostgreSQL.
-   It does not create PostgreSQL databases or database users.
-   It does not create Kubernetes namespaces.
-   It does not create database credential Secrets.
-   It does not deploy the Auth, User or Item application Deployments.

Database provisioning and application deployments are separate tasks.

------------------------------------------------------------------------

## 2. Architecture and environment details

### 2.1 External PostgreSQL server

  Component            Value
  -------------------- -----------------
  VM name              `testdb`
  Operating system     Ubuntu
  IP address           `192.168.56.14`
  PostgreSQL port      `5432`
  PostgreSQL version   `16`

The Kubernetes nodes and Pods must be able to reach `192.168.56.14` over
TCP port `5432`.

### 2.2 Environment mapping

  -------------------------------------------------------------------------------------------------------------------
  Environment   Kubernetes         Database     Auth database    User database    Item database    Existing Secret
                namespace          user                                                            
  ------------- ------------------ ------------ ---------------- ---------------- ---------------- ------------------
  Dev           `micro-app-dev`    `dev_app`    `dev_auth_db`    `dev_user_db`    `dev_item_db`    `dev-db-secret`

  Test          `micro-app-test`   `test_app`   `test_auth_db`   `test_user_db`   `test_item_db`   `test-db-secret`

  QA            `micro-app-qa`     `qa_app`     `qa_auth_db`     `qa_user_db`     `qa_item_db`     `qa-db-secret`
  -------------------------------------------------------------------------------------------------------------------

All three environments connect to the same PostgreSQL host and port.
They use separate database names and database users.

### 2.3 Configuration flow

``` text
                  Kubernetes Cluster
                          |
                 external-postgres Helm
                          |
          +---------------+----------------+
          |               |                |
        Dev             Test               QA
   micro-app-dev   micro-app-test    micro-app-qa
          |               |                |
    Helm values     Helm values       Helm values
          |               |                |
    +-----+-----+   +-----+-----+    +-----+-----+
    |     |     |   |     |     |    |     |     |
   Auth  User  Item Auth  User  Item Auth  User  Item
    CM    CM    CM   CM    CM    CM   CM    CM    CM
          |               |                |
          +---------------+----------------+
                          |
                 TCP 5432 / PostgreSQL
                          |
                192.168.56.14 (testdb)
```

`CM` means ConfigMap. Each application Deployment references its
service-specific ConfigMap and the environment's existing Secret.

### 2.4 ConfigMap and Secret responsibilities

Keep non-sensitive configuration separate from credentials.

  ------------------------------------------------------------------------------------------------------
  Setting                   Stored in               Example
  ------------------------- ----------------------- ----------------------------------------------------
  `DB_HOST`                 ConfigMap               `192.168.56.14`

  `DB_PORT`                 ConfigMap               `5432`

  `SPRING_DATASOURCE_URL`   Service-specific        `jdbc:postgresql://192.168.56.14:5432/dev_auth_db`
                            ConfigMap               

  `DB_USERNAME`             Kubernetes Secret       `dev_app`

  `DB_PASSWORD`             Kubernetes Secret       Stored securely
  ------------------------------------------------------------------------------------------------------

Each environment Secret contains only these two keys:

-   `DB_USERNAME`
-   `DB_PASSWORD`

**Important:** Do not put passwords in `values.yaml`,
environment-specific values files, ConfigMaps, source control or
`application.properties`.

------------------------------------------------------------------------

## 3. Prerequisites

Before installing the chart, make sure the following are ready:

1.  PostgreSQL 16 is running on `192.168.56.14:5432`.
2.  The Dev, Test and QA databases and users have already been created
    on PostgreSQL.
3.  Each database user has the required privileges on the three
    databases for its environment.
4.  The Kubernetes namespaces exist.
5.  The environment-specific Kubernetes Secret exists in the
    corresponding namespace.
6.  Kubernetes nodes can route to the PostgreSQL VM and the VM firewall
    permits the required connection.
7.  Helm and kubectl are installed and configured to access the cluster.

### 3.1 Check the namespaces

``` bash
kubectl get namespaces
```

Create a namespace only if it does not already exist:

``` bash
kubectl create namespace micro-app-dev
kubectl create namespace micro-app-test
kubectl create namespace micro-app-qa
```

### 3.2 Check the existing Secrets

``` bash
kubectl get secret dev-db-secret -n micro-app-dev
kubectl get secret test-db-secret -n micro-app-test
kubectl get secret qa-db-secret -n micro-app-qa
```

Check the Secret key names without printing their values:

``` bash
kubectl get secret dev-db-secret -n micro-app-dev \
  -o go-template='{{range $k, $v := .data}}{{printf "%s\n" $k}}{{end}}'
```

Expected key names:

``` text
DB_USERNAME
DB_PASSWORD
```

Repeat for Test and QA:

``` bash
kubectl get secret test-db-secret -n micro-app-test \
  -o go-template='{{range $k, $v := .data}}{{printf "%s\n" $k}}{{end}}'

kubectl get secret qa-db-secret -n micro-app-qa \
  -o go-template='{{range $k, $v := .data}}{{printf "%s\n" $k}}{{end}}'
```

If a Secret is missing, create it using your approved secure
credential-handling process. Example syntax (replace the placeholders;
do not commit real passwords to Git):

``` bash
kubectl create secret generic dev-db-secret \
  --namespace micro-app-dev \
  --from-literal=DB_USERNAME='dev_app' \
  --from-literal=DB_PASSWORD='<DEV_DATABASE_PASSWORD>'
```

Use the corresponding username, password and namespace for Test and QA.
If the Secret already exists, do not recreate it unnecessarily.

------------------------------------------------------------------------

## 4. Helm chart directory structure

Repository location:

``` text
~/Micro_App_Doc/
```

Chart location:

``` text
~/Micro_App_Doc/helm/external-postgres/
```

Expected chart structure:

``` text
external-postgres/
├── Chart.yaml
├── values.yaml
├── values-dev.yaml
├── values-test.yaml
├── values-qa.yaml
└── templates/
    ├── NOTES.txt
    ├── _helpers.tpl
    ├── auth-configmap.yaml
    ├── user-configmap.yaml
    └── item-configmap.yaml
```

Create the directory if required:

``` bash
cd ~/Micro_App_Doc
mkdir -p helm/external-postgres/templates
cd helm/external-postgres
```

------------------------------------------------------------------------

## 5. Chart metadata

File: `Chart.yaml`

``` yaml
apiVersion: v2
name: external-postgres
description: External PostgreSQL connection configuration for microservices
type: application
version: 0.1.0
appVersion: "16"
```

`appVersion` is chart metadata in this implementation. This chart does
not deploy the PostgreSQL server.

------------------------------------------------------------------------

## 6. Helm values files

The values files provide environment-specific settings to the templates.
The chart templates use these values to create ConfigMaps.

### 6.1 Default values --- `values.yaml`

``` yaml
environment: dev

database:
  host: "192.168.56.14"
  port: 5432

  authDatabase: "dev_auth_db"
  userDatabase: "dev_user_db"
  itemDatabase: "dev_item_db"

existingSecret: "dev-db-secret"
```

### 6.2 Dev --- `values-dev.yaml`

``` yaml
environment: dev

database:
  host: "192.168.56.14"
  port: 5432

  authDatabase: "dev_auth_db"
  userDatabase: "dev_user_db"
  itemDatabase: "dev_item_db"

existingSecret: "dev-db-secret"
```

### 6.3 Test --- `values-test.yaml`

``` yaml
environment: test

database:
  host: "192.168.56.14"
  port: 5432

  authDatabase: "test_auth_db"
  userDatabase: "test_user_db"
  itemDatabase: "test_item_db"

existingSecret: "test-db-secret"
```

### 6.4 QA --- `values-qa.yaml`

``` yaml
environment: qa

database:
  host: "192.168.56.14"
  port: 5432

  authDatabase: "qa_auth_db"
  userDatabase: "qa_user_db"
  itemDatabase: "qa_item_db"

existingSecret: "qa-db-secret"
```

The `existingSecret` value documents which environment Secret is
expected. The ConfigMap templates do not create that Secret; application
Deployments reference it.

------------------------------------------------------------------------

## 7. Helm templates

The templates create the service-specific ConfigMaps. They read the
host, port and database names from the selected values file.

### 7.1 Helper template --- `templates/_helpers.tpl`

``` yaml
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

The helper defines a consistent resource name and common labels.

### 7.2 Auth ConfigMap --- `templates/auth-configmap.yaml`

``` yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ include "external-postgres.fullname" . }}-auth
  labels:
    {{- include "external-postgres.labels" . | nindent 4 }}
data:
  DB_HOST: {{ .Values.database.host | quote }}
  DB_PORT: {{ .Values.database.port | quote }}
  SPRING_DATASOURCE_URL: {{ printf "jdbc:postgresql://%s:%v/%s" .Values.database.host .Values.database.port .Values.database.authDatabase | quote }}
```

### 7.3 User ConfigMap --- `templates/user-configmap.yaml`

``` yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ include "external-postgres.fullname" . }}-user
  labels:
    {{- include "external-postgres.labels" . | nindent 4 }}
data:
  DB_HOST: {{ .Values.database.host | quote }}
  DB_PORT: {{ .Values.database.port | quote }}
  SPRING_DATASOURCE_URL: {{ printf "jdbc:postgresql://%s:%v/%s" .Values.database.host .Values.database.port .Values.database.userDatabase | quote }}
```

### 7.4 Item ConfigMap --- `templates/item-configmap.yaml`

``` yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ include "external-postgres.fullname" . }}-item
  labels:
    {{- include "external-postgres.labels" . | nindent 4 }}
data:
  DB_HOST: {{ .Values.database.host | quote }}
  DB_PORT: {{ .Values.database.port | quote }}
  SPRING_DATASOURCE_URL: {{ printf "jdbc:postgresql://%s:%v/%s" .Values.database.host .Values.database.port .Values.database.itemDatabase | quote }}
```

### 7.5 Installation notes --- `templates/NOTES.txt`

``` text
External PostgreSQL connection configuration installed.

Environment: {{ .Values.environment }}
PostgreSQL Host: {{ .Values.database.host }}
PostgreSQL Port: {{ .Values.database.port }}

Expected existing credentials Secret: {{ .Values.existingSecret }}

Generated ConfigMaps:
  {{ include "external-postgres.fullname" . }}-auth
  {{ include "external-postgres.fullname" . }}-user
  {{ include "external-postgres.fullname" . }}-item

Application Deployments must reference the matching ConfigMap
and map DB_USERNAME and DB_PASSWORD from the existing Secret.
```

**Template change to remember:** `DB_HOST` and `DB_PORT` are explicitly
rendered into each service ConfigMap. Merely defining values in a values
file does not automatically make them available to a Pod. The template
must render them, and the Pod must reference the ConfigMap keys.

------------------------------------------------------------------------

## 8. Validate the Helm chart before deployment

Run all commands from the chart directory:

``` bash
cd ~/Micro_App_Doc/helm/external-postgres
```

### 8.1 Check chart files

``` bash
find . -maxdepth 2 -type f | sort
```

### 8.2 Lint the chart

``` bash
helm lint .
```

Resolve any reported errors before deploying. A recommendation such as a
missing chart icon is not necessarily a lint failure.

### 8.3 Render the Dev templates

``` bash
helm template external-postgres . \
  --namespace micro-app-dev \
  -f values-dev.yaml
```

In the rendered Auth ConfigMap, verify that the output contains:

``` yaml
data:
  DB_HOST: "192.168.56.14"
  DB_PORT: "5432"
  SPRING_DATASOURCE_URL: "jdbc:postgresql://192.168.56.14:5432/dev_auth_db"
```

Also verify the User and Item JDBC URLs:

``` text
jdbc:postgresql://192.168.56.14:5432/dev_user_db
jdbc:postgresql://192.168.56.14:5432/dev_item_db
```

Render Test and QA before deployment too:

``` bash
helm template external-postgres . \
  --namespace micro-app-test \
  -f values-test.yaml

helm template external-postgres . \
  --namespace micro-app-qa \
  -f values-qa.yaml
```

`helm template` only renders YAML. It does not create or change
Kubernetes resources.

------------------------------------------------------------------------

## 9. Install or upgrade the Helm release

The release name is `external-postgres` in each namespace. Helm releases
are namespace-scoped, so the same release name can be used in Dev, Test
and QA.

### 9.1 Dev

``` bash
helm upgrade --install external-postgres . \
  --namespace micro-app-dev \
  --create-namespace \
  -f values-dev.yaml
```

### 9.2 Test

``` bash
helm upgrade --install external-postgres . \
  --namespace micro-app-test \
  --create-namespace \
  -f values-test.yaml
```

### 9.3 QA

``` bash
helm upgrade --install external-postgres . \
  --namespace micro-app-qa \
  --create-namespace \
  -f values-qa.yaml
```

`--create-namespace` creates the namespace if it does not exist. It does
not create the database Secret.

------------------------------------------------------------------------

## 10. Verify Helm releases and ConfigMaps

### 10.1 Check releases

``` bash
helm list -n micro-app-dev
helm list -n micro-app-test
helm list -n micro-app-qa
```

Check release details:

``` bash
helm status external-postgres -n micro-app-dev
helm status external-postgres -n micro-app-test
helm status external-postgres -n micro-app-qa
```

### 10.2 Check ConfigMaps

``` bash
kubectl get configmaps -n micro-app-dev
kubectl get configmaps -n micro-app-test
kubectl get configmaps -n micro-app-qa
```

Expected names in each namespace:

``` text
external-postgres-auth
external-postgres-user
external-postgres-item
```

### 10.3 Inspect the Dev Auth ConfigMap

``` bash
kubectl get configmap external-postgres-auth \
  -n micro-app-dev -o yaml
```

Check individual keys:

``` bash
kubectl get configmap external-postgres-auth \
  -n micro-app-dev \
  -o jsonpath='{.data.DB_HOST}{"\n"}{.data.DB_PORT}{"\n"}{.data.SPRING_DATASOURCE_URL}{"\n"}'
```

Expected:

``` text
192.168.56.14
5432
jdbc:postgresql://192.168.56.14:5432/dev_auth_db
```

### 10.4 Verify the other Dev service URLs

``` bash
kubectl get configmap external-postgres-user \
  -n micro-app-dev \
  -o jsonpath='{.data.SPRING_DATASOURCE_URL}{"\n"}'

kubectl get configmap external-postgres-item \
  -n micro-app-dev \
  -o jsonpath='{.data.SPRING_DATASOURCE_URL}{"\n"}'
```

Expected:

``` text
jdbc:postgresql://192.168.56.14:5432/dev_user_db
jdbc:postgresql://192.168.56.14:5432/dev_item_db
```

### 10.5 Verify Test and QA

For Test:

``` bash
kubectl get configmap external-postgres-auth -n micro-app-test -o yaml
kubectl get configmap external-postgres-user -n micro-app-test -o yaml
kubectl get configmap external-postgres-item -n micro-app-test -o yaml
```

For QA:

``` bash
kubectl get configmap external-postgres-auth -n micro-app-qa -o yaml
kubectl get configmap external-postgres-user -n micro-app-qa -o yaml
kubectl get configmap external-postgres-item -n micro-app-qa -o yaml
```

Confirm that each environment has the correct database names and that
the host and port match the expected PostgreSQL endpoint.

------------------------------------------------------------------------

## 11. Test database connectivity from Kubernetes

A successful Helm deployment and correct ConfigMaps do not, by
themselves, prove that a Pod can authenticate to PostgreSQL. Run a
temporary PostgreSQL client Pod to test network access, authentication
and database access.

The test Pod obtains:

-   `DB_HOST` and `DB_PORT` from the generated Auth ConfigMap.
-   `DB_USERNAME` and `DB_PASSWORD` from the environment's existing
    Secret.

The host and port are common to all three databases in an environment,
so the Auth ConfigMap can provide them for this connectivity test. The
loop tests all three database names.

### 11.1 Dev connectivity test

Create `/tmp/dev-db-connectivity-test.yaml`:

``` yaml
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

          : "${DB_HOST:?DB_HOST is missing}"
          : "${DB_PORT:?DB_PORT is missing}"
          : "${DB_USERNAME:?DB_USERNAME is missing}"
          : "${DB_PASSWORD:?DB_PASSWORD is missing}"

          echo "PostgreSQL Host: $DB_HOST"
          echo "PostgreSQL Port: $DB_PORT"
          echo "Database User: $DB_USERNAME"

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

          echo "================================"
          echo "ALL DATABASE CONNECTIONS SUCCESSFUL"
          echo "================================"
      env:
        - name: DB_HOST
          valueFrom:
            configMapKeyRef:
              name: external-postgres-auth
              key: DB_HOST
        - name: DB_PORT
          valueFrom:
            configMapKeyRef:
              name: external-postgres-auth
              key: DB_PORT
      envFrom:
        - secretRef:
            name: dev-db-secret
```

Apply and monitor:

``` bash
kubectl apply -f /tmp/dev-db-connectivity-test.yaml

kubectl get pod dev-db-connectivity-test \
  -n micro-app-dev -w
```

Wait for the Pod to reach `Completed`, then inspect its logs:

``` bash
kubectl logs dev-db-connectivity-test -n micro-app-dev
```

Expected database/user results:

``` text
dev_auth_db | dev_app
dev_user_db | dev_app
dev_item_db | dev_app
```

Remove the temporary Pod and file:

``` bash
kubectl delete pod dev-db-connectivity-test \
  -n micro-app-dev

rm -f /tmp/dev-db-connectivity-test.yaml
```

### 11.2 Test connectivity

Create `/tmp/test-db-connectivity.yaml` with the same structure,
changing the namespace, Pod name, Secret and database names:

``` yaml
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

          : "${DB_HOST:?DB_HOST is missing}"
          : "${DB_PORT:?DB_PORT is missing}"
          : "${DB_USERNAME:?DB_USERNAME is missing}"
          : "${DB_PASSWORD:?DB_PASSWORD is missing}"

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

          echo "ALL TEST DATABASE CONNECTIONS SUCCESSFUL"
      env:
        - name: DB_HOST
          valueFrom:
            configMapKeyRef:
              name: external-postgres-auth
              key: DB_HOST
        - name: DB_PORT
          valueFrom:
            configMapKeyRef:
              name: external-postgres-auth
              key: DB_PORT
      envFrom:
        - secretRef:
            name: test-db-secret
```

Apply, monitor and inspect:

``` bash
kubectl apply -f /tmp/test-db-connectivity.yaml

kubectl get pod test-db-connectivity -n micro-app-test -w

kubectl logs test-db-connectivity -n micro-app-test
```

Expected database/user results:

``` text
test_auth_db | test_app
test_user_db | test_app
test_item_db | test_app
```

Clean up:

``` bash
kubectl delete pod test-db-connectivity -n micro-app-test
rm -f /tmp/test-db-connectivity.yaml
```

### 11.3 QA connectivity test

Create `/tmp/qa-db-connectivity.yaml`:

``` yaml
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

          : "${DB_HOST:?DB_HOST is missing}"
          : "${DB_PORT:?DB_PORT is missing}"
          : "${DB_USERNAME:?DB_USERNAME is missing}"
          : "${DB_PASSWORD:?DB_PASSWORD is missing}"

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

          echo "ALL QA DATABASE CONNECTIONS SUCCESSFUL"
      env:
        - name: DB_HOST
          valueFrom:
            configMapKeyRef:
              name: external-postgres-auth
              key: DB_HOST
        - name: DB_PORT
          valueFrom:
            configMapKeyRef:
              name: external-postgres-auth
              key: DB_PORT
      envFrom:
        - secretRef:
            name: qa-db-secret
```

Apply, monitor and inspect:

``` bash
kubectl apply -f /tmp/qa-db-connectivity.yaml

kubectl get pod qa-db-connectivity -n micro-app-qa -w

kubectl logs qa-db-connectivity -n micro-app-qa
```

Expected database/user results:

``` text
qa_auth_db | qa_app
qa_user_db | qa_app
qa_item_db | qa_app
```

Clean up:

``` bash
kubectl delete pod qa-db-connectivity -n micro-app-qa
rm -f /tmp/qa-db-connectivity.yaml
```

**Validation note:** Mark an environment as passed only after its actual
connectivity test has completed successfully and the logs show the
expected database and user.

------------------------------------------------------------------------

## 12. Connect the application Deployments

The external-postgres chart creates the ConfigMaps, but it does not
automatically inject their values into application Pods. Each
application Helm chart or Deployment manifest must explicitly reference
the appropriate ConfigMap and Secret.

### 12.1 Dev Auth Service example

In the Auth Service Deployment container specification:

``` yaml
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

### 12.2 ConfigMap mapping by service

  Application    ConfigMap
  -------------- --------------------------
  Auth Service   `external-postgres-auth`
  User Service   `external-postgres-user`
  Item Service   `external-postgres-item`

The User and Item Deployments use the same Secret keys but reference
their own service-specific ConfigMaps.

### 12.3 Secret mapping by environment

  Environment   Secret referenced by application Deployment
  ------------- ---------------------------------------------
  Dev           `dev-db-secret`
  Test          `test-db-secret`
  QA            `qa-db-secret`

For Test and QA, change the Secret name in the application Deployment to
the corresponding environment Secret. The ConfigMaps have the same names
in each namespace, so the application references the ConfigMap in its
own namespace.

### 12.4 Spring Boot application properties

The application should read the injected environment variables:

``` properties
spring.datasource.url=${SPRING_DATASOURCE_URL}
spring.datasource.username=${SPRING_DATASOURCE_USERNAME}
spring.datasource.password=${SPRING_DATASOURCE_PASSWORD}

spring.datasource.driver-class-name=org.postgresql.Driver
```

Do not hardcode the database IP, database name, username or password in
the application properties when these values are supplied through
Kubernetes configuration.

### 12.5 Verify application Pod environment

After deploying an application, check its Pod and logs:

``` bash
kubectl get pods -n micro-app-dev
kubectl logs <auth-service-pod-name> -n micro-app-dev
```

Do not print or expose passwords while troubleshooting. Verify that the
application starts and connects to the intended database.

------------------------------------------------------------------------

## 13. Helm release management commands

Run commands from the chart directory:

``` bash
cd ~/Micro_App_Doc/helm/external-postgres
```

### 13.1 List releases

``` bash
helm list -n micro-app-dev
helm list -n micro-app-test
helm list -n micro-app-qa
```

### 13.2 Check release status

``` bash
helm status external-postgres -n micro-app-dev
```

Change the namespace for Test or QA.

### 13.3 View release history and revisions

``` bash
helm history external-postgres -n micro-app-dev
```

### 13.4 Upgrade an existing release

``` bash
helm upgrade external-postgres . \
  --namespace micro-app-dev \
  -f values-dev.yaml
```

### 13.5 Install or upgrade in one command

``` bash
helm upgrade --install external-postgres . \
  --namespace micro-app-dev \
  --create-namespace \
  -f values-dev.yaml
```

### 13.6 Render without deploying

``` bash
helm template external-postgres . \
  --namespace micro-app-dev \
  -f values-dev.yaml
```

### 13.7 Roll back to a previous revision

First inspect history:

``` bash
helm history external-postgres -n micro-app-dev
```

Then use the revision number shown in the history:

``` bash
helm rollback external-postgres <REVISION_NUMBER> \
  --namespace micro-app-dev
```

Do not assume that revision `1` is the correct rollback target; select
the known-good revision from the output.

### 13.8 Uninstall a release

Only when you intentionally want to remove the chart-managed ConfigMaps:

``` bash
helm uninstall external-postgres -n micro-app-dev
```

Repeat for Test or QA only if required. Uninstalling this chart does not
uninstall the external PostgreSQL server. It also does not remove the
separately managed database Secrets.

------------------------------------------------------------------------

## 14. Updating database connection configuration

For example, if the PostgreSQL server IP changes:

1.  Update `database.host` in the relevant environment values file.
2.  Run `helm lint .`.
3.  Render the chart with `helm template`.
4.  Confirm the generated `DB_HOST`, `DB_PORT` and JDBC URLs.
5.  Upgrade the relevant Helm release.
6.  Verify the deployed ConfigMaps.
7.  Restart or roll out application Deployments that consume ConfigMap
    values as environment variables.
8.  Run the connectivity test again.

Example Dev upgrade:

``` bash
helm upgrade external-postgres . \
  --namespace micro-app-dev \
  -f values-dev.yaml
```

If an application consumes ConfigMap values as environment variables,
Kubernetes does not update the environment of an already-running
container. Restart the application Deployment after the ConfigMap
change:

``` bash
kubectl rollout restart deployment/<deployment-name> \
  -n micro-app-dev

kubectl rollout status deployment/<deployment-name> \
  -n micro-app-dev
```

Repeat for each affected application Deployment. A restart is not
normally needed merely to update a ConfigMap-mounted volume, but the
application must be able to reload the changed file.

------------------------------------------------------------------------

## 15. Troubleshooting

### 15.1 `DB_HOST is missing` or `DB_PORT is missing`

**Possible cause:** The ConfigMap does not contain the key, or the Pod
is not referencing the correct ConfigMap.

Check the ConfigMap:

``` bash
kubectl get configmap external-postgres-auth \
  -n micro-app-dev -o yaml
```

Confirm it contains:

``` yaml
data:
  DB_HOST: "192.168.56.14"
  DB_PORT: "5432"
```

Check that the Pod's `configMapKeyRef.name` and `key` match the actual
ConfigMap.

### 15.2 psql tries to connect through a local Unix socket

An error mentioning a local socket such as
`/var/run/postgresql/.s.PGSQL.5432` commonly means the `psql` command
did not receive a valid host argument.

Check that `DB_HOST` and `DB_PORT` are populated and that the command
uses:

``` bash
psql --host="$DB_HOST" --port="$DB_PORT" ...
```

Check YAML indentation and shell line continuations in the Pod manifest.

### 15.3 Password authentication failed

Check that the Pod references the correct environment Secret and keys:

``` yaml
envFrom:
  - secretRef:
      name: dev-db-secret
```

The Secret should contain `DB_USERNAME` and `DB_PASSWORD`. Confirm that
the corresponding PostgreSQL user and password are valid on the database
server. Do not paste passwords into logs or shared documentation.

### 15.4 ConfigMap key not found

Check the exact name and key:

``` bash
kubectl describe configmap external-postgres-auth \
  -n micro-app-dev
```

The key names are case-sensitive. The template must render `DB_HOST` and
`DB_PORT` before a Pod can reference them.

### 15.5 Helm output does not contain the expected host or port

Check the selected values file and template:

``` bash
helm template external-postgres . \
  --namespace micro-app-dev \
  -f values-dev.yaml
```

Confirm that the template uses:

``` yaml
DB_HOST: {{ .Values.database.host | quote }}
DB_PORT: {{ .Values.database.port | quote }}
```

A values file alone does not create ConfigMap keys. The template must
explicitly render each key.

### 15.6 Network connection timeout or connection refused

Check:

-   PostgreSQL is running and listening on the expected address and
    port.
-   The PostgreSQL VM firewall allows TCP `5432` from the Kubernetes
    network.
-   The PostgreSQL host-based authentication rules allow the Kubernetes
    source network.
-   The Kubernetes nodes have a route to `192.168.56.14`.
-   The database service is listening on the VM network interface, not
    only on localhost.

A successful ConfigMap check does not prove network connectivity. Use
the temporary PostgreSQL client Pod to test the connection from
Kubernetes.

### 15.7 ConfigMap updated but application still uses old settings

If the application consumes ConfigMap values as environment variables,
restart its Deployment after the Helm upgrade:

``` bash
kubectl rollout restart deployment/<deployment-name> \
  -n micro-app-dev
```

Then check rollout status and application logs.

------------------------------------------------------------------------

## 16. Final verification checklist

Use this checklist separately for each environment.

### Dev

-   [ ] Namespace `micro-app-dev` exists.
-   [ ] Secret `dev-db-secret` exists with `DB_USERNAME` and
    `DB_PASSWORD`.
-   [ ] Helm release `external-postgres` is deployed.
-   [ ] Auth, User and Item ConfigMaps exist.
-   [ ] Each ConfigMap contains `DB_HOST` and `DB_PORT`.
-   [ ] Each ConfigMap has the correct service-specific JDBC URL.
-   [ ] Dev connectivity test completes successfully for all three
    databases.
-   [ ] Application Deployments reference the correct ConfigMaps and
    Secret.

### Test

-   [ ] Namespace `micro-app-test` exists.
-   [ ] Secret `test-db-secret` exists with `DB_USERNAME` and
    `DB_PASSWORD`.
-   [ ] Helm release `external-postgres` is deployed.
-   [ ] Auth, User and Item ConfigMaps exist.
-   [ ] Each ConfigMap contains `DB_HOST` and `DB_PORT`.
-   [ ] Each ConfigMap has the correct service-specific JDBC URL.
-   [ ] Test connectivity test completes successfully for all three
    databases.
-   [ ] Application Deployments reference the correct ConfigMaps and
    Secret.

### QA

-   [ ] Namespace `micro-app-qa` exists.
-   [ ] Secret `qa-db-secret` exists with `DB_USERNAME` and
    `DB_PASSWORD`.
-   [ ] Helm release `external-postgres` is deployed.
-   [ ] Auth, User and Item ConfigMaps exist.
-   [ ] Each ConfigMap contains `DB_HOST` and `DB_PORT`.
-   [ ] Each ConfigMap has the correct service-specific JDBC URL.
-   [ ] QA connectivity test completes successfully for all three
    databases.
-   [ ] Application Deployments reference the correct ConfigMaps and
    Secret.

Do not mark a connectivity check as passed until the test Pod has
completed and its output confirms the expected database and database
user.

------------------------------------------------------------------------

## 17. Architecture notes and future improvements

1.  The external PostgreSQL server is independently managed at
    `192.168.56.14:5432`.
2.  The Helm chart manages connection ConfigMaps only; database
    provisioning is outside this chart.
3.  The same chart is reused across Dev, Test and QA through separate
    values files and namespace-scoped releases.
4.  Each service receives its own JDBC URL through its service-specific
    ConfigMap.
5.  `DB_HOST` and `DB_PORT` are also rendered into each service
    ConfigMap so Pods can consume them without hardcoding connection
    details.
6.  Database credentials remain in the pre-existing environment-specific
    Kubernetes Secrets.
7.  Application Deployments must explicitly reference the appropriate
    ConfigMap and Secret.
8.  The in-cluster PostgreSQL StatefulSet should only be removed after
    all applications have been migrated and verified against the
    external database.
9.  For a future production environment, a secrets-management solution
    such as HashiCorp Vault can replace direct Kubernetes Secret
    injection. The production implementation should be documented and
    tested separately; do not assume this Dev/Test/QA chart configures
    Vault.

------------------------------------------------------------------------

## 18. Reference project structure

``` text
Micro_App_Doc/
├── helm/
│   └── external-postgres/
│       ├── Chart.yaml
│       ├── values.yaml
│       ├── values-dev.yaml
│       ├── values-test.yaml
│       ├── values-qa.yaml
│       └── templates/
│           ├── NOTES.txt
│           ├── _helpers.tpl
│           ├── auth-configmap.yaml
│           ├── user-configmap.yaml
│           └── item-configmap.yaml
└── kubernetes/
    ├── auth-service/
    ├── user-service/
    ├── item-service/
    └── frontend/
```

------------------------------------------------------------------------

## Conclusion

This implementation uses one reusable Helm chart to manage external
PostgreSQL connection configuration for Dev, Test and QA.

Environment-specific values supply the PostgreSQL host, port and
database names. Helm renders those values into service-specific
ConfigMaps. Existing Kubernetes Secrets supply only the database
username and password. Application Deployments explicitly reference the
appropriate ConfigMap and Secret.

This separation keeps non-sensitive configuration out of application
manifests, avoids putting credentials in Helm values or ConfigMaps, and
makes it easier to maintain consistent configuration across
environments.
