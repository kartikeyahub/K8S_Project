## 1. Architecture

### 1.1 Components

| Component | Configuration |
|---|---|
| Database VM | `testdb` |
| Operating system | Ubuntu 22.04 |
| Database | PostgreSQL 16 |
| Container runtime | Docker |
| Container orchestration | Docker Compose |
| Database VM IP | `192.168.56.14` |
| PostgreSQL port | `5432` |
| PostgreSQL project directory | `~/postgres-db` |
| Kubernetes namespaces | `micro-app-dev`, `micro-app-test`, `micro-app-qa` |
| Helm chart | `external-postgres` |

All Kubernetes nodes and application Pods must be able to reach `192.168.56.14:5432`.

### 1.2 Environment and database mapping

Each environment has its own database role and three databases.

| Environment | Kubernetes namespace | PostgreSQL role | Auth database | User database | Item database | Kubernetes Secret |
|---|---|---|---|---|---|---|
| Dev | `micro-app-dev` | `dev_app` | `dev_auth_db` | `dev_user_db` | `dev_item_db` | `dev-db-secret` |
| Test | `micro-app-test` | `test_app` | `test_auth_db` | `test_user_db` | `test_item_db` | `test-db-secret` |
| QA | `micro-app-qa` | `qa_app` | `qa_auth_db` | `qa_user_db` | `qa_item_db` | `qa-db-secret` |

All three environments use the same PostgreSQL VM, but their databases and credentials are separated.

### 1.3 Configuration and secret design

The Helm chart creates ConfigMaps containing non-sensitive connection settings:

- `DB_HOST`
- `DB_PORT`
- `SPRING_DATASOURCE_URL`

Kubernetes Secrets contain only sensitive credentials:

- `DB_USERNAME`
- `DB_PASSWORD`

The chart does not create PostgreSQL databases or credential Secrets. Those are managed separately.

---

## 2. Prepare the PostgreSQL VM

Log in to the Ubuntu VM named `testdb`.

Check the operating system:

```bash
cat /etc/os-release
```

Check the IP address:

```bash
ip addr
```

Confirm that the VM has the expected private IP:

```text
192.168.56.14
```

Check memory and disk:

```bash
free -h
df -h
```

Make sure the VM has sufficient disk space for database files and backups.

---

## 3. Install Docker and Docker Compose

Update Ubuntu:

```bash
sudo apt update
sudo apt upgrade -y
```

Install Docker and the Docker Compose plugin:

```bash
sudo apt install -y docker.io docker-compose-v2
```

Enable and start Docker:

```bash
sudo systemctl enable --now docker
```

Verify the installation:

```bash
docker --version
docker compose version
sudo systemctl status docker
```

If you want to run Docker without `sudo`, add your login user to the Docker group:

```bash
sudo usermod -aG docker "$USER"
```

Log out and back in for the group change to take effect. Membership in the Docker group effectively grants root-level control of the host, so only trusted administrators should receive it.

---

## 4. Create the PostgreSQL project structure

Create the project directories:

```bash
mkdir -p ~/postgres-db/{data,init,backup}
cd ~/postgres-db
```

The directory structure will be:

```text
postgres-db/
├── .env
├── docker-compose.yaml
├── init/
│   └── 01-init-databases.sh
├── data/
└── backup/
```

| File or directory | Purpose |
|---|---|
| `.env` | PostgreSQL image version and administrator settings |
| `docker-compose.yaml` | PostgreSQL container configuration |
| `init/` | First-initialization SQL/shell scripts |
| `data/` | Persistent PostgreSQL database files |
| `backup/` | Database backup files |

Protect the `.env` file and do not commit it to source control.

---

## 5. Configure PostgreSQL environment variables

Create the environment file:

```bash
cd ~/postgres-db
nano .env
```

Add:

```dotenv
POSTGRES_VERSION=16
POSTGRES_USER=postgres
POSTGRES_PASSWORD=REPLACE_WITH_A_STRONG_ADMIN_PASSWORD
PGDATA=/var/lib/postgresql/data/pgdata
```

Replace the placeholder with a strong, unique administrator password.

Set restrictive permissions:

```bash
chmod 600 .env
```

Add these files to `.gitignore` if this project is stored in Git:

```gitignore
.env
data/
backup/
```

Do not store real passwords in a public repository.

---

## 6. Create the database initialization script

Create the script:

```bash
nano init/01-init-databases.sh
```

Add the following:

```bash
#!/bin/bash
set -e

echo "Creating application roles and databases..."

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname postgres <<'SQL'

-- Application roles
CREATE USER dev_app  WITH PASSWORD 'REPLACE_WITH_DEV_PASSWORD';
CREATE USER test_app WITH PASSWORD 'REPLACE_WITH_TEST_PASSWORD';
CREATE USER qa_app   WITH PASSWORD 'REPLACE_WITH_QA_PASSWORD';

-- Dev databases
CREATE DATABASE dev_auth_db OWNER dev_app;
CREATE DATABASE dev_user_db OWNER dev_app;
CREATE DATABASE dev_item_db OWNER dev_app;

-- Test databases
CREATE DATABASE test_auth_db OWNER test_app;
CREATE DATABASE test_user_db OWNER test_app;
CREATE DATABASE test_item_db OWNER test_app;

-- QA databases
CREATE DATABASE qa_auth_db OWNER qa_app;
CREATE DATABASE qa_user_db OWNER qa_app;
CREATE DATABASE qa_item_db OWNER qa_app;

SQL

echo "Application roles and databases created."
```

Replace all three password placeholders with strong, unique values. These values must match the credentials later entered into the Kubernetes Secrets.

Make the script executable:

```bash
chmod 750 init/01-init-databases.sh
```

### Important: initialization scripts run only once

The official PostgreSQL image executes scripts in `/docker-entrypoint-initdb.d/` only when the database data directory is first initialized.

If `data/` already contains an initialized PostgreSQL cluster, changing this script and restarting the container will not rerun it. For an existing cluster, create or modify roles and databases using SQL commands.

---

## 7. Configure Docker Compose

Create the Compose file:

```bash
nano docker-compose.yaml
```

Use this configuration:

```yaml
services:
  postgres:
    image: postgres:${POSTGRES_VERSION}
    container_name: testdb-postgres
    restart: unless-stopped

    env_file:
      - .env

    environment:
      PGDATA: ${PGDATA}

    ports:
      - "192.168.56.14:5432:5432"

    volumes:
      - ./data:/var/lib/postgresql/data
      - ./init:/docker-entrypoint-initdb.d:ro

    healthcheck:
      test:
        - CMD-SHELL
        - pg_isready -U "$$POSTGRES_USER" -d postgres
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
```

### Configuration explanation

| Setting | Purpose |
|---|---|
| `image` | Uses the PostgreSQL version specified in `.env` |
| `container_name` | Gives the container a predictable name |
| `restart` | Restarts the container unless it is explicitly stopped |
| `env_file` | Loads PostgreSQL environment variables |
| `ports` | Publishes PostgreSQL on the VM's private IP and port |
| `data` volume | Persists database files on the VM |
| `init` volume | Mounts initialization scripts read-only |
| `healthcheck` | Checks whether PostgreSQL is accepting connections |

The port binding uses the VM's private IP. Confirm that `192.168.56.14` is assigned to the VM before starting the service.

---

## 8. Set directory permissions

The official PostgreSQL container runs the database process as a non-root user. The container image commonly uses UID/GID `999` for the PostgreSQL account.

Set ownership and permissions for the data directory:

```bash
sudo chown -R 999:999 ~/postgres-db/data
sudo chmod 700 ~/postgres-db/data
```

Make sure the initialization directory and script are readable by the container:

```bash
sudo chown -R root:999 ~/postgres-db/init
sudo chmod 750 ~/postgres-db/init
sudo chmod 640 ~/postgres-db/init/01-init-databases.sh
```

If the container cannot read the initialization script, inspect the directory ownership and permissions before changing them further.

---

## 9. Validate and start PostgreSQL

Validate the Compose configuration:

```bash
cd ~/postgres-db
docker compose config --quiet
docker compose config --services
```

The service list should include:

```text
postgres
```

Start PostgreSQL:

```bash
docker compose up -d
```

Check the container:

```bash
docker compose ps
```

Check logs:

```bash
docker logs testdb-postgres
```

Wait until the health status is `healthy` and the logs indicate that PostgreSQL is ready to accept connections.

Useful commands:

```bash
docker compose logs -f postgres
docker compose restart postgres
docker compose stop postgres
docker compose start postgres
```

---

## 10. Verify PostgreSQL roles and databases

Open a PostgreSQL shell inside the container:

```bash
docker exec -it testdb-postgres \
  psql -U postgres -d postgres
```

List databases:

```sql
\l
```

List roles:

```sql
\du
```

Check database owners:

```sql
SELECT
    datname,
    pg_catalog.pg_get_userbyid(datdba) AS owner
FROM pg_database
WHERE datname NOT IN ('template0', 'template1', 'postgres')
ORDER BY datname;
```

Expected ownership:

| Database | Owner |
|---|---|
| `dev_auth_db` | `dev_app` |
| `dev_user_db` | `dev_app` |
| `dev_item_db` | `dev_app` |
| `test_auth_db` | `test_app` |
| `test_user_db` | `test_app` |
| `test_item_db` | `test_app` |
| `qa_auth_db` | `qa_app` |
| `qa_user_db` | `qa_app` |
| `qa_item_db` | `qa_app` |

Exit:

```sql
\q
```

### Test database authentication locally

You can test a role from inside the PostgreSQL container. Enter the actual password when prompted:

```bash
docker exec -it testdb-postgres bash
```

Inside the container:

```bash
read -rsp "Enter dev_app password: " PGPASSWORD
echo
export PGPASSWORD

psql -h 127.0.0.1 \
  -p 5432 \
  -U dev_app \
  -d dev_item_db \
  -c "SELECT current_database(), current_user;"

unset PGPASSWORD
exit
```

Expected result should identify `dev_item_db` and `dev_app`.

---

## 11. Verify network connectivity from Kubernetes

Before deploying application workloads, confirm that the Kubernetes nodes can reach the database VM.

From a Kubernetes node:

```bash
ping -c 3 192.168.56.14
```

Check TCP port 5432:

```bash
nc -vz 192.168.56.14 5432
```

If `nc` is not installed:

```bash
sudo apt install -y netcat-openbsd
```

Expected result:

```text
Connection to 192.168.56.14 5432 port [tcp/postgresql] succeeded!
```

If the connection fails, check:

- The PostgreSQL container is running and healthy.
- The Compose port binding uses the correct VM IP.
- The VM network allows traffic from the Kubernetes nodes.
- The host firewall allows TCP port `5432` from trusted cluster networks.
- PostgreSQL is listening on the published port.

Do not expose PostgreSQL publicly. Restrict access to the required private network addresses.

---

## 12. Create Kubernetes namespaces

Create the three namespaces:

```bash
kubectl create namespace micro-app-dev
kubectl create namespace micro-app-test
kubectl create namespace micro-app-qa
```

If a namespace already exists, do not delete it just to rerun the command.

Verify:

```bash
kubectl get namespaces
```

---

## 13. Create Kubernetes database Secrets

The current design stores only credentials in Kubernetes Secrets. Host, port and JDBC URLs are supplied by Helm-managed ConfigMaps.

Create each Secret in the namespace where its application Pods will run.

### 13.1 Dev Secret

```bash
read -rsp "Enter dev_app password: " DB_PASSWORD
echo

kubectl create secret generic dev-db-secret \
  -n micro-app-dev \
  --from-literal=DB_USERNAME=dev_app \
  --from-literal=DB_PASSWORD="$DB_PASSWORD"

unset DB_PASSWORD
```

### 13.2 Test Secret

```bash
read -rsp "Enter test_app password: " DB_PASSWORD
echo

kubectl create secret generic test-db-secret \
  -n micro-app-test \
  --from-literal=DB_USERNAME=test_app \
  --from-literal=DB_PASSWORD="$DB_PASSWORD"

unset DB_PASSWORD
```

### 13.3 QA Secret

```bash
read -rsp "Enter qa_app password: " DB_PASSWORD
echo

kubectl create secret generic qa-db-secret \
  -n micro-app-qa \
  --from-literal=DB_USERNAME=qa_app \
  --from-literal=DB_PASSWORD="$DB_PASSWORD"

unset DB_PASSWORD
```

Enter the same passwords configured for the corresponding PostgreSQL roles.

Verify the Secrets without displaying their values:

```bash
kubectl describe secret dev-db-secret -n micro-app-dev
kubectl describe secret test-db-secret -n micro-app-test
kubectl describe secret qa-db-secret -n micro-app-qa
```

Expected keys:

```text
DB_USERNAME
DB_PASSWORD
```

If a Secret already exists and you need to update it, use `kubectl create secret generic ... --dry-run=client -o yaml | kubectl apply -f -` with the appropriate namespace and values. Avoid printing passwords in terminal logs or shell history.

**Security note:** Kubernetes Secret data is base64-encoded by default; base64 is not encryption. Enable encryption at rest for Kubernetes Secrets and restrict access through RBAC.

---

# Part II – Helm Configuration

## 14. Helm chart overview

The chart is named `external-postgres`. It generates three service-specific ConfigMaps in each environment namespace.

The same chart is deployed three times, using a different values file for each environment.

### 14.1 Directory structure

From the project repository:

```text
Micro_App_Doc/
└── helm/
    └── external-postgres/
        ├── Chart.yaml
        ├── values.yaml
        ├── values-dev.yaml
        ├── values-test.yaml
        ├── values-qa.yaml
        └── templates/
            ├── _helpers.tpl
            ├── NOTES.txt
            ├── auth-configmap.yaml
            ├── user-configmap.yaml
            └── item-configmap.yaml
```

### 14.2 What the chart creates

For each namespace, Helm creates:

| ConfigMap | Service | Database URL |
|---|---|---|
| `external-postgres-auth` | Auth Service | Environment's Auth database |
| `external-postgres-user` | User Service | Environment's User database |
| `external-postgres-item` | Item Service | Environment's Item database |

The chart does not create Secrets, database roles, databases, Deployments or Services.

---

## 15. Complete Helm chart files

Go to the chart directory:

```bash
cd ~/Micro_App_Doc/helm/external-postgres
```

### 15.1 `Chart.yaml`

```yaml
apiVersion: v2
name: external-postgres
description: Helm chart for external PostgreSQL connection configuration
type: application
version: 1.0.0
appVersion: "1.0"
```

### 15.2 `values.yaml`

This file provides default values:

```yaml
database:
  host: "192.168.56.14"
  port: 5432

  authDatabase: "dev_auth_db"
  userDatabase: "dev_user_db"
  itemDatabase: "dev_item_db"
```

### 15.3 `values-dev.yaml`

```yaml
database:
  host: "192.168.56.14"
  port: 5432

  authDatabase: "dev_auth_db"
  userDatabase: "dev_user_db"
  itemDatabase: "dev_item_db"
```

### 15.4 `values-test.yaml`

```yaml
database:
  host: "192.168.56.14"
  port: 5432

  authDatabase: "test_auth_db"
  userDatabase: "test_user_db"
  itemDatabase: "test_item_db"
```

### 15.5 `values-qa.yaml`

```yaml
database:
  host: "192.168.56.14"
  port: 5432

  authDatabase: "qa_auth_db"
  userDatabase: "qa_user_db"
  itemDatabase: "qa_item_db"
```

The host and port are common in this example. The database names differ by environment.

### 15.6 `templates/_helpers.tpl`

```yaml
{{/*
Common chart labels
*/}}
{{- define "external-postgres.labels" -}}
app.kubernetes.io/name: external-postgres
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
{{- end }}
```

### 15.7 `templates/auth-configmap.yaml`

```yaml
apiVersion: v1
kind: ConfigMap

metadata:
  name: external-postgres-auth
  labels:
    {{- include "external-postgres.labels" . | nindent 4 }}

data:
  DB_HOST: {{ .Values.database.host | quote }}
  DB_PORT: {{ .Values.database.port | quote }}

  SPRING_DATASOURCE_URL: {{ printf "jdbc:postgresql://%s:%v/%s" .Values.database.host .Values.database.port .Values.database.authDatabase | quote }}
```

### 15.8 `templates/user-configmap.yaml`

```yaml
apiVersion: v1
kind: ConfigMap

metadata:
  name: external-postgres-user
  labels:
    {{- include "external-postgres.labels" . | nindent 4 }}

data:
  DB_HOST: {{ .Values.database.host | quote }}
  DB_PORT: {{ .Values.database.port | quote }}

  SPRING_DATASOURCE_URL: {{ printf "jdbc:postgresql://%s:%v/%s" .Values.database.host .Values.database.port .Values.database.userDatabase | quote }}
```

### 15.9 `templates/item-configmap.yaml`

```yaml
apiVersion: v1
kind: ConfigMap

metadata:
  name: external-postgres-item
  labels:
    {{- include "external-postgres.labels" . | nindent 4 }}

data:
  DB_HOST: {{ .Values.database.host | quote }}
  DB_PORT: {{ .Values.database.port | quote }}

  SPRING_DATASOURCE_URL: {{ printf "jdbc:postgresql://%s:%v/%s" .Values.database.host .Values.database.port .Values.database.itemDatabase | quote }}
```

### 15.10 `templates/NOTES.txt`

```text
External PostgreSQL configuration deployed successfully.

Release: {{ .Release.Name }}
Namespace: {{ .Release.Namespace }}

Generated ConfigMaps:
- external-postgres-auth
- external-postgres-user
- external-postgres-item

Database Host: {{ .Values.database.host }}
Database Port: {{ .Values.database.port }}

Verify the ConfigMaps using:
kubectl get configmaps -n {{ .Release.Namespace }}
```

---

## 16. Validate the Helm chart

Run these commands from the chart directory:

```bash
cd ~/Micro_App_Doc/helm/external-postgres
helm lint .
```

Render the Dev templates locally:

```bash
helm template external-postgres . \
  --namespace micro-app-dev \
  -f values-dev.yaml
```

Render the Test templates:

```bash
helm template external-postgres . \
  --namespace micro-app-test \
  -f values-test.yaml
```

Render the QA templates:

```bash
helm template external-postgres . \
  --namespace micro-app-qa \
  -f values-qa.yaml
```

Review the rendered ConfigMaps and confirm that each JDBC URL points to the correct environment database.

---

## 17. Install or upgrade the Helm releases

Use the same release name in each namespace. Helm release names are scoped to namespaces.

### 17.1 Dev

```bash
helm upgrade --install external-postgres . \
  --namespace micro-app-dev \
  --create-namespace \
  -f values-dev.yaml
```

### 17.2 Test

```bash
helm upgrade --install external-postgres . \
  --namespace micro-app-test \
  --create-namespace \
  -f values-test.yaml
```

### 17.3 QA

```bash
helm upgrade --install external-postgres . \
  --namespace micro-app-qa \
  --create-namespace \
  -f values-qa.yaml
```

`--upgrade --install` makes the command reusable: it installs the release if it does not exist and upgrades it if it already exists.

---

## 18. Verify Helm releases and ConfigMaps

List releases:

```bash
helm list -A
```

Check each release:

```bash
helm status external-postgres -n micro-app-dev
helm status external-postgres -n micro-app-test
helm status external-postgres -n micro-app-qa
```

Check ConfigMaps:

```bash
kubectl get configmaps -n micro-app-dev
kubectl get configmaps -n micro-app-test
kubectl get configmaps -n micro-app-qa
```

Inspect a ConfigMap:

```bash
kubectl describe configmap external-postgres-auth \
  -n micro-app-dev
```

Check its data:

```bash
kubectl get configmap external-postgres-auth \
  -n micro-app-dev \
  -o yaml
```

Expected ConfigMaps in each namespace:

```text
external-postgres-auth
external-postgres-user
external-postgres-item
```

The Auth ConfigMap in Dev should contain a JDBC URL similar to:

```text
jdbc:postgresql://192.168.56.14:5432/dev_auth_db
```

---
### 18.1 Check the existing Secrets

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

## 19. Test database connectivity from Kubernetes using ConfigMaps and Secrets

This test verifies all three Dev databases from a temporary PostgreSQL client Pod. The Pod reads host and port from the Helm-generated ConfigMap and credentials from the Kubernetes Secret.

Create `postgres-connectivity-test-dev.yaml`:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: postgres-connectivity-test
  namespace: micro-app-dev

spec:
  restartPolicy: Never

  containers:
    - name: postgres-client
      image: postgres:16
      command: ["/bin/bash", "-c"]
      args:
        - |
          set -e

          for DB in dev_auth_db dev_user_db dev_item_db
          do
            echo "Testing database: $DB"

            PGPASSWORD="$DB_PASSWORD" \
            psql -h "$DB_HOST" \
                 -p "$DB_PORT" \
                 -U "$DB_USERNAME" \
                 -d "$DB" \
                 -c "SELECT current_database(), current_user;"
          done

          echo "ALL DATABASE CONNECTIONS SUCCESSFUL"

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

        - name: DB_USERNAME
          valueFrom:
            secretKeyRef:
              name: dev-db-secret
              key: DB_USERNAME

        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: dev-db-secret
              key: DB_PASSWORD
```

Apply the test:

```bash
kubectl apply -f postgres-connectivity-test-dev.yaml
```

Check status:

```bash
kubectl get pods -n micro-app-dev
```

Read logs:

```bash
kubectl logs postgres-connectivity-test -n micro-app-dev
```

The expected result is a successful query for each database, followed by:

```text
ALL DATABASE CONNECTIONS SUCCESSFUL
```

Delete the test Pod after validation:

```bash
kubectl delete pod postgres-connectivity-test -n micro-app-dev
```

### Test and QA connectivity

For Test and QA, use the same Pod specification but change:

| Setting | Test | QA |
|---|---|---|
| Namespace | `micro-app-test` | `micro-app-qa` |
| ConfigMap | `external-postgres-auth` | `external-postgres-auth` |
| Secret | `test-db-secret` | `qa-db-secret` |
| Database names | `test_auth_db`, `test_user_db`, `test_item_db` | `qa_auth_db`, `qa_user_db`, `qa_item_db` |

The ConfigMap names are the same in each namespace because each Helm release creates its own namespaced ConfigMaps.

---

# Part III – Application Integration

## 20. Configure Spring Boot services

Each microservice uses its own ConfigMap for the JDBC URL and the environment's Secret for the username and password.

### 20.1 Auth Service Deployment example

For Dev:

```yaml
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

### 20.2 User Service

Use the User ConfigMap:

```yaml
- name: SPRING_DATASOURCE_URL
  valueFrom:
    configMapKeyRef:
      name: external-postgres-user
      key: SPRING_DATASOURCE_URL
```

Use the same environment-specific Secret references for username and password.

### 20.3 Item Service

Use the Item ConfigMap:

```yaml
- name: SPRING_DATASOURCE_URL
  valueFrom:
    configMapKeyRef:
      name: external-postgres-item
      key: SPRING_DATASOURCE_URL
```

Again, use the correct environment-specific Secret for credentials.

### 20.4 Service-to-ConfigMap mapping

| Microservice | ConfigMap |
|---|---|
| Auth Service | `external-postgres-auth` |
| User Service | `external-postgres-user` |
| Item Service | `external-postgres-item` |

For Test, replace `dev-db-secret` with `test-db-secret`. For QA, use `qa-db-secret`.

### 20.5 Spring Boot `application.properties`

Use environment variable placeholders:

```properties
spring.application.name=auth-service
server.port=8080

spring.datasource.url=${SPRING_DATASOURCE_URL}
spring.datasource.username=${SPRING_DATASOURCE_USERNAME}
spring.datasource.password=${SPRING_DATASOURCE_PASSWORD}

spring.datasource.driver-class-name=org.postgresql.Driver
```

Use the same datasource property pattern for User and Item services.

Do not put real database passwords in `application.properties`, Docker images, Helm values files or ConfigMaps.

### 20.6 Restart application Deployments after configuration changes

Environment variables are read when a container starts. If a ConfigMap or Secret changes, restart the affected Deployment so new Pods receive the updated values.

For example:

```bash
kubectl rollout restart deployment/auth-service -n micro-app-dev
kubectl rollout status deployment/auth-service -n micro-app-dev
```

Use the actual Deployment names in your cluster.

---

## 21. Useful Helm commands

Run commands from the chart directory when a chart path (`.`) is required.

| Operation | Command |
|---|---|
| Validate chart | `helm lint .` |
| Render templates | `helm template external-postgres . -n micro-app-dev -f values-dev.yaml` |
| Install or upgrade Dev | `helm upgrade --install external-postgres . -n micro-app-dev -f values-dev.yaml` |
| List all releases | `helm list -A` |
| List releases in a namespace | `helm list -n micro-app-dev` |
| Show release status | `helm status external-postgres -n micro-app-dev` |
| Show release history | `helm history external-postgres -n micro-app-dev` |
| Show configured values | `helm get values external-postgres -n micro-app-dev` |
| Show all values | `helm get values external-postgres -n micro-app-dev --all` |
| Show deployed manifests | `helm get manifest external-postgres -n micro-app-dev` |
| Roll back to revision 1 | `helm rollback external-postgres 1 -n micro-app-dev` |
| Uninstall release | `helm uninstall external-postgres -n micro-app-dev` |

Repeat namespace-specific commands for Test and QA as required.

### Check revisions before rollback

```bash
helm history external-postgres -n micro-app-dev
```

Choose the required revision from the output, then run:

```bash
helm rollback external-postgres REVISION_NUMBER \
  -n micro-app-dev
```

Replace `REVISION_NUMBER` with the actual revision.

---

# Part IV – Backup, Troubleshooting and Operations

## 22. Back up PostgreSQL databases

Create the backup directory if it does not exist:

```bash
mkdir -p ~/postgres-db/backup
```

Back up one database:

```bash
docker exec testdb-postgres \
  pg_dump -U postgres -d dev_item_db \
  > ~/postgres-db/backup/dev_item_db.sql
```

Back up the other databases by changing the database name and output filename.

List backup files:

```bash
ls -lh ~/postgres-db/backup/
```

Restore a SQL backup into an existing database:

```bash
cat ~/postgres-db/backup/dev_item_db.sql | \
  docker exec -i testdb-postgres \
  psql -U postgres -d dev_item_db
```

A production backup strategy should include scheduled backups, retention, an off-VM copy and regular restore testing.

---

## 23. Troubleshooting

### 23.1 PostgreSQL container is not starting

Check:

```bash
docker compose ps
docker compose logs postgres
```

Review the `.env` file, Compose configuration, port binding and data directory permissions.

### 23.2 Port 5432 is already in use

Check:

```bash
sudo ss -lntp | grep 5432
```

Find the process already listening on port 5432. Do not stop an existing database service until you understand what uses it.

### 23.3 Kubernetes cannot reach PostgreSQL

Check from a Kubernetes node:

```bash
nc -vz 192.168.56.14 5432
```

Then verify the Docker container, host firewall, VM network and Compose port binding.

### 23.4 Password authentication failed

Confirm that:

- The Kubernetes Secret contains the correct username and password.
- The password matches the PostgreSQL role.
- The application references the correct namespace Secret.
- The application connects to the correct database.

Do not paste passwords into shared terminal output or logs.

### 23.5 ConfigMap key not found

Inspect the ConfigMap:

```bash
kubectl get configmap external-postgres-auth \
  -n micro-app-dev -o yaml
```

Confirm it contains `DB_HOST`, `DB_PORT` and `SPRING_DATASOURCE_URL`. Re-run the Helm upgrade if the chart was changed.

### 23.6 Helm release is not found

Check:

```bash
helm list -A
```

Remember that releases are namespace-scoped. Check the correct namespace.

### 23.7 Initialization script changes do not take effect

PostgreSQL initialization scripts run only when the data directory is first initialized. For an existing database, apply SQL changes manually. Do not delete the data directory just to rerun initialization scripts unless you intentionally want to destroy the database.

### 23.8 Application Pods still use old configuration

Restart the affected Deployment:

```bash
kubectl rollout restart deployment/DEPLOYMENT_NAME \
  -n NAMESPACE
```

Replace the placeholders with the actual Deployment and namespace.

---

## 24. Security and operational recommendations

1. Use strong, unique passwords for the PostgreSQL administrator and each application role.
2. Do not commit `.env`, database backups or password-bearing initialization scripts to Git.
3. Restrict TCP port `5432` to trusted Kubernetes node and application networks.
4. Do not expose PostgreSQL directly to the public internet.
5. Enable Kubernetes Secret encryption at rest and restrict Secret access using RBAC.
6. Use a secret manager for production credentials where appropriate.
7. Keep PostgreSQL data on persistent storage and maintain independent backups.
8. Test database restore procedures regularly.
9. Avoid `docker compose down -v` unless you intentionally want to remove named volumes.
10. Do not remove the `data/` directory during routine troubleshooting.

---

## 25. Final verification checklist

| Area | Verification | Expected result |
|---|---|---|
| Ubuntu VM | IP address | `192.168.56.14` |
| Docker | Docker service | Running |
| Docker Compose | Configuration validation | No errors |
| PostgreSQL | Container health | Healthy |
| PostgreSQL | Version | 16 |
| PostgreSQL | Application roles | Dev, Test and QA roles exist |
| PostgreSQL | Databases | Nine environment databases exist |
| PostgreSQL | Persistence | Data stored under `data/` |
| Network | TCP port 5432 | Reachable from Kubernetes |
| Kubernetes | Namespaces | Dev, Test and QA exist |
| Kubernetes | Secrets | Correct credentials in each namespace |
| Helm | Chart validation | `helm lint` succeeds |
| Helm | Releases | One release per environment |
| Helm | ConfigMaps | Three service ConfigMaps per namespace |
| Connectivity | Dev database tests | All three connections succeed |
| Connectivity | Test database tests | All three connections succeed |
| Connectivity | QA database tests | All three connections succeed |
| Applications | Datasource configuration | Correct ConfigMap and Secret references |

Only mark a check as complete after verifying it in the environment.

---

## 26. Final architecture

```text
                         Kubernetes Cluster
                    +----------------------------+
                    |                            |
                    |  micro-app-dev             |
                    |   Auth / User / Item       |
                    |   ConfigMaps + Secret     |
                    |                            |
                    |  micro-app-test            |
                    |   Auth / User / Item       |
                    |   ConfigMaps + Secret     |
                    |                            |
                    |  micro-app-qa              |
                    |   Auth / User / Item       |
                    |   ConfigMaps + Secret     |
                    |                            |
                    +--------------+-------------+
                                   |
                         TCP 192.168.56.14:5432
                                   |
                                   v
                    +----------------------------+
                    |       Ubuntu testdb        |
                    |                            |
                    |       Docker Compose       |
                    |       PostgreSQL 16        |
                    |                            |
                    |  Dev:                      |
                    |   dev_auth_db              |
                    |   dev_user_db              |
                    |   dev_item_db              |
                    |                            |
                    |  Test:                     |
                    |   test_auth_db             |
                    |   test_user_db             |
                    |   test_item_db             |
                    |                            |
                    |  QA:                       |
                    |   qa_auth_db               |
                    |   qa_user_db               |
                    |   qa_item_db               |
                    |                            |
                    +----------------------------+
```

## 27. Conclusion

This implementation separates database hosting from Kubernetes application workloads.

Docker Compose manages PostgreSQL 16 and its persistent data on the external Ubuntu VM. Helm manages service-specific ConfigMaps for Dev, Test and QA. Kubernetes Secrets provide each environment's database credentials to the application Pods.

The result is a reusable configuration model with environment separation, centralized connection configuration, independent database operations and a clear path for integrating a secret manager in production.

**Important scope note:** This README documents the TestDB setup and the Dev/Test/QA Helm configuration. A separate Production database VM and Stage/Production configuration should be documented and validated independently before being treated as deployed.
