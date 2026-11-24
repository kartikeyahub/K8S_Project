Here is the complete step-by-step article for configuring the second external PostgreSQL server, `proddb`, for your **Stage and Production Kubernetes environments**.

It follows the same architecture as TestDB, with separate database users and databases for Stage and Production.

# External PostgreSQL 16 Configuration on proddb for Stage and Production

## 1. Introduction

This article explains how to configure an external PostgreSQL 16 database server on an Ubuntu VM using Docker and Docker Compose.

The PostgreSQL server will host separate databases for Stage and Production environments. Kubernetes microservices will connect to this server using its private IP address.

### Architecture details

| Component         | Configuration  |
| ----------------- | -------------- |
| VM hostname       | proddb         |
| Operating System  | Ubuntu 22.04   |
| Database          | PostgreSQL 16  |
| Container Runtime | Docker         |
| Deployment        | Docker Compose |
| Private IP        | 192.168.56.15  |
| PostgreSQL Port   | 5432           |
| Project Directory | \~/postgres-db |

### Environment and database design

| Environment | Kubernetes namespace | Database user | Databases                                   |
| ----------- | -------------------- | ------------- | ------------------------------------------- |
| Stage       | micro-app-stage      | stage_app     | stage_auth_db, stage_user_db, stage_item_db |
| Production  | micro-app-prod       | prod_app      | prod_auth_db, prod_user_db, prod_item_db    |

Each environment has a separate database user that owns its three databases.

---

## 2. Verify the proddb Ubuntu server

Log in to the `proddb` VM.

Check the operating system:

```
cat /etc/os-release
```

Check the hostname:

```
hostname
```

Expected:

```
proddb
```

Check the network configuration:

```
ip addr
```

Confirm the private IP:

```
192.168.56.15
```

Check available memory and disk:

```
free -h
df -h
```

---

## 3. Install Docker

Update Ubuntu:

```
sudo apt update
sudo apt upgrade -y
```

Install Docker and Docker Compose:

```
sudo apt install -y docker.io docker-compose-v2
```

Enable and start Docker:

```
sudo systemctl enable docker
sudo systemctl start docker
```

Verify Docker:

```
docker --version
docker compose version
```

Check Docker service:

```
sudo systemctl status docker
```

---

## 4. Create the PostgreSQL project directory

Create the project directory:

```
mkdir -p ~/postgres-db
cd ~/postgres-db
```

Create the required folders:

```
mkdir -p data init backup
```

Project structure:

```
postgres-db/
│
├── .env
├── docker-compose.yaml
│
├── init/
│   └── 01-init-databases.sh
│
├── data/
│
└── backup/
```

Folder purpose:

| File/Directory      | Purpose                                             |
| ------------------- | --------------------------------------------------- |
| .env                | PostgreSQL configuration and administrator password |
| docker-compose.yaml | PostgreSQL container configuration                  |
| init/               | Initial database and user creation script           |
| data/               | Persistent database files                           |
| backup/             | Database backup files                               |

---

## 5. Configure PostgreSQL environment variables

Create the `.env` file:

```
nano .env
```

Add:

```
POSTGRES_VERSION=16
POSTGRES_USER=postgres
POSTGRES_PASSWORD=REPLACE_WITH_STRONG_ADMIN_PASSWORD
PGDATA=/var/lib/postgresql/data/pgdata
```

### *****  Replace the administrator password with a strong, unique password. *****

Save the file and protect it:

```
chmod 600 .env
```

Never commit this file to GitHub.

---

## 6. Create the database initialization script

Create the initialization script:

```
nano init/01-init-databases.sh
```

Add:

```
#!/bin/bash

set -e

echo "Creating Stage and Production database users..."

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname postgres <<'SQL'

-- Create application users

CREATE USER stage_app WITH PASSWORD 'REPLACE_STAGE_PASSWORD';

CREATE USER prod_app WITH PASSWORD 'REPLACE_PROD_PASSWORD';

-- Stage databases

CREATE DATABASE stage_auth_db OWNER stage_app;
CREATE DATABASE stage_user_db OWNER stage_app;
CREATE DATABASE stage_item_db OWNER stage_app;

-- Production databases

CREATE DATABASE prod_auth_db OWNER prod_app;
CREATE DATABASE prod_user_db OWNER prod_app;
CREATE DATABASE prod_item_db OWNER prod_app;

SQL

echo "Stage and Production databases created successfully."
```

### *****Replace the two application passwords with strong, unique passwords.  *****

Save the file.

**Important:** The official PostgreSQL image runs initialization scripts only when the database data directory is empty and being initialized for the first time.

If you already initialized this PostgreSQL instance, do not simply restart it expecting this script to execute. Create the missing users and databases manually using SQL instead.

---

## 7. Configure Docker Compose

Create the Compose file:

```
nano docker-compose.yaml
```

Add:

```
services:
  postgres:
    image: postgres:${POSTGRES_VERSION}
    container_name: proddb-postgres
    restart: unless-stopped

    env_file:
      - .env

    environment:
      PGDATA: ${PGDATA}

    ports:
      - "192.168.56.15:5432:5432"

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

- `image`: Uses PostgreSQL 16.
- `container_name`: Names the container `proddb-postgres`.
- `restart`: Restarts the container automatically.
- `env_file`: Loads PostgreSQL environment variables.
- `ports`: Exposes PostgreSQL on the private IP `192.168.56.15`, port `5432`.
- `data`: Persists database files outside the container.
- `init`: Mounts the initialization script.
- `healthcheck`: Checks PostgreSQL readiness.

---

## 8. Configure directory permissions

The official PostgreSQL container normally runs as UID 999.

Configure the data directory:

```
sudo chown -R 999:999 ~/postgres-db/data
sudo chmod 700 ~/postgres-db/data
```

Configure the initialization directory:

```
sudo chown -R "$USER":999 ~/postgres-db/init
sudo chmod 750 ~/postgres-db/init
sudo chmod 750 ~/postgres-db/init/01-init-databases.sh
```

These permissions allow the container to access the initialization script and database files.

---

## 9. Validate Docker Compose configuration

Move into the project directory:

```
cd ~/postgres-db
```

Validate:

```
docker compose config --quiet
```

List services:

```
docker compose config --services
```

Expected:

```
postgres
```

---

## 10. Start PostgreSQL

Start the container:

```
docker compose up -d
```

Check container status:

```
docker compose ps
```

Expected:

```
NAME              IMAGE         STATUS
proddb-postgres   postgres:16   Up (healthy)
```

Check logs:

```
docker logs proddb-postgres
```

Look for:

```
Creating Stage and Production database users...
CREATE ROLE
CREATE ROLE
CREATE DATABASE
...
Stage and Production databases created successfully.
database system is ready to accept connections
```

---

## 11. Verify databases and users

Connect to PostgreSQL:

```
docker exec -it proddb-postgres \
  psql -U postgres -d postgres
```

List databases:

```
\l
```

List users:

```
\du
```

Check database ownership:

```
SELECT
    datname,
    pg_catalog.pg_get_userbyid(datdba) AS owner
FROM pg_database
WHERE datname NOT IN ('template0', 'template1', 'postgres')
ORDER BY datname;
```

Expected ownership:

| Database      | Owner     |
| ------------- | --------- |
| stage_auth_db | stage_app |
| stage_user_db | stage_app |
| stage_item_db | stage_app |
| prod_auth_db  | prod_app  |
| prod_user_db  | prod_app  |
| prod_item_db  | prod_app  |

Exit:

```
\q
```

---

## 12. Verify network connectivity

From the Kubernetes master, check connectivity to proddb.

Ping:

```
ping -c 3 192.168.56.15
```

Check PostgreSQL port:

```
nc -vz 192.168.56.15 5432
```

Expected:

```
Connection to 192.168.56.15 5432 port [tcp/postgresql] succeeded!
```

If `nc` is missing:

```
sudo apt install -y netcat-openbsd
```

---

## 13. Test PostgreSQL connectivity from Kubernetes

Test the PostgreSQL port from a temporary Pod:

```
kubectl run proddb-connectivity-test \
  --image=postgres:16 \
  --restart=Never \
  --rm -it \
  --command -- \
  pg_isready \
  -h 192.168.56.15 \
  -p 5432 \
  -U stage_app \
  -d stage_item_db
```

Expected:

```
192.168.56.15:5432 - accepting connections
```

This confirms that Kubernetes Pods can reach the external PostgreSQL server.

### Test actual database authentication

Start a temporary PostgreSQL client Pod:

```
kubectl run proddb-auth-test \
  --image=postgres:16 \
  --restart=Never \
  -it \
  --command -- \
  bash
```

Inside the Pod:

```
export PGPASSWORD
read -rsp "Enter stage_app password: " PGPASSWORD
echo
```

Connect:

```
psql -h 192.168.56.15 \
  -p 5432 \
  -U stage_app \
  -d stage_item_db \
  -c "SELECT current_database(), current_user, inet_server_addr();"
```

After testing:

```
unset PGPASSWORD
exit
```

Delete the temporary Pod if it remains:

```
kubectl delete pod proddb-auth-test --ignore-not-found
```

---

## 14. Create Kubernetes namespaces

Create Stage and Production namespaces:

```
kubectl create namespace micro-app-stage
kubectl create namespace micro-app-prod
```

If either namespace already exists, that is fine.

Verify:

```
kubectl get namespaces | grep micro-app
```

Expected:

```
micro-app-stage
micro-app-prod
```

---

## 15. Create Stage Kubernetes Secret

Run this on the Kubernetes master:

```
read -rsp "Enter stage_app password: " DB_PASSWORD
echo

kubectl create secret generic stage-db-secret \
  -n micro-app-stage \
  --from-literal=DB_HOST=192.168.56.15 \
  --from-literal=DB_PORT=5432 \
  --from-literal=DB_NAME=stage_item_db \
  --from-literal=DB_USERNAME=stage_app \
  --from-literal=DB_PASSWORD="$DB_PASSWORD"

unset DB_PASSWORD
```

The password will not be displayed while entering it.

---

## 16. Create Production Kubernetes Secret

Run:

```
read -rsp "Enter prod_app password: " DB_PASSWORD
echo

kubectl create secret generic prod-db-secret \
  -n micro-app-prod \
  --from-literal=DB_HOST=192.168.56.15 \
  --from-literal=DB_PORT=5432 \
  --from-literal=DB_NAME=prod_item_db \
  --from-literal=DB_USERNAME=prod_app \
  --from-literal=DB_PASSWORD="$DB_PASSWORD"

unset DB_PASSWORD
```

Enter the current PostgreSQL password for `prod_app`.

---

## 17. Verify Stage and Production Secrets

Verify Stage:

```
kubectl describe secret stage-db-secret -n micro-app-stage
```

Verify Production:

```
kubectl describe secret prod-db-secret -n micro-app-prod
```

Expected keys:

```
DB_HOST
DB_NAME
DB_PASSWORD
DB_PORT
DB_USERNAME
```

Do not share actual Secret values or base64-encoded Secret YAML in screenshots or logs.

---

## 18. Connect Spring Boot microservices

Example Dev-style Spring Boot configuration, adapted for Stage and Production:

```
spring.datasource.url=jdbc:postgresql://${DB_HOST}:${DB_PORT}/${DB_NAME}
spring.datasource.username=${DB_USERNAME}
spring.datasource.password=${DB_PASSWORD}

spring.datasource.driver-class-name=org.postgresql.Driver
```

Kubernetes Deployment example for Stage:

```
env:
  - name: DB_HOST
    valueFrom:
      secretKeyRef:
        name: stage-db-secret
        key: DB_HOST

  - name: DB_PORT
    valueFrom:
      secretKeyRef:
        name: stage-db-secret
        key: DB_PORT

  - name: DB_USERNAME
    valueFrom:
      secretKeyRef:
        name: stage-db-secret
        key: DB_USERNAME

  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: stage-db-secret
        key: DB_PASSWORD

  - name: DB_NAME
    value: stage_item_db
```

For Production, change:

```
secretKeyRef:
  name: prod-db-secret
```

And set:

```
- name: DB_NAME
  value: prod_item_db
```

Use the appropriate database name for Auth, User, and Item Services.

| Service      | Stage database | Production database |
| ------------ | -------------- | ------------------- |
| Auth Service | stage_auth_db  | prod_auth_db        |
| User Service | stage_user_db  | prod_user_db        |
| Item Service | stage_item_db  | prod_item_db        |

---

## 19. Backup PostgreSQL databases

Create the backup directory:

```
mkdir -p ~/postgres-db/backup
```

Back up Stage Item DB:

```
docker exec proddb-postgres \
  pg_dump -U postgres -d stage_item_db \
  > ~/postgres-db/backup/stage_item_db.sql
```

Back up Production Item DB:

```
docker exec proddb-postgres \
  pg_dump -U postgres -d prod_item_db \
  > ~/postgres-db/backup/prod_item_db.sql
```

Check backup files:

```
ls -lh ~/postgres-db/backup/
```

For a full production backup strategy, schedule backups, keep off-server copies, protect backup credentials, and regularly test restores.

---

## 20. Security considerations

1. Use strong, unique database passwords.
2. Do not commit `.env` or initialization scripts containing credentials to Git.
3. Restrict port `5432` to trusted Kubernetes nodes and application networks.
4. Kubernetes Secrets are base64-encoded by default, not automatically encrypted. Configure encryption at rest and restrictive RBAC.
5. Use an external secret manager for stronger production credential management.
6. Do not expose PostgreSQL directly to the public internet.
7. Keep regular backups outside the database VM.
8. Test database restoration periodically.
9. Do not delete the PostgreSQL `data/` directory during troubleshooting.
10. Do not run `docker compose down -v` unless intentionally destroying persistent data.

**Production note:** Although this setup creates a separate Production database and user, Stage and Production still share one PostgreSQL instance and one VM. This is suitable for a lab demonstration, not strong production isolation or high availability. For a real production deployment, use dedicated infrastructure, monitoring, backup recovery, access controls, and high availability.

---

## 21. Final verification checklist

| Task                        | Expected result       |
| --------------------------- | --------------------- |
| Ubuntu server preparation   | Completed             |
| Docker installation         | Installed             |
| PostgreSQL 16 container     | Running               |
| Docker Compose validation   | Successful            |
| Persistent data storage     | Configured            |
| Stage user                  | Created               |
| Production user             | Created               |
| Stage databases             | 3 created             |
| Production databases        | 3 created             |
| Database ownership          | Correct               |
| Network connectivity        | Port 5432 reachable   |
| Kubernetes Pod connectivity | Successful            |
| Stage namespace             | Created               |
| Production namespace        | Created               |
| Stage Secret                | Created               |
| Production Secret           | Created               |
| Spring Boot configuration   | Ready for integration |
| Database backups            | Configured            |

---

## 22. Final architecture

```
                    Kubernetes Cluster
                --------------------------
                |                        |
                |      Master            |
                |      Worker 1          |
                |      Worker 2          |
                |      Worker 3          |
                |                        |
                --------------------------
                           |
                           |
                   PostgreSQL Connection
                    192.168.56.15:5432
                           |
                           v
                --------------------------
                |         proddb         |
                |                        |
                |    Docker Container    |
                |    PostgreSQL 16       |
                |                        |
                |    stage_auth_db       |
                |    stage_user_db       |
                |    stage_item_db       |
                |                        |
                |    prod_auth_db        |
                |    prod_user_db        |
                |    prod_item_db        |
                |                        |
                --------------------------
```

**Result:** The proddb server provides six databases, two separate application users, persistent Docker storage, Kubernetes connectivity, and dedicated Stage and Production Secrets.

Together with the testdb server, the architecture now supports all five environments: Dev, Test, QA, Stage, and Production.

### **Your complete database architecture**

**testdb — 192.168.56.14:5432**

Dev / Test / QA

- `dev_app` → 3 databases
- `test_app` → 3 databases
- `qa_app` → 3 databases

**proddb — 192.168.56.15:5432**

Stage / Production

- `stage_app` → 3 databases
- `prod_app` → 3 databases

# **5 environments · 15 databases**

Two external PostgreSQL servers · Five application database users

**Next step:** Once you complete the `proddb` setup, we'll verify all 15 databases and five Kubernetes Secrets, then proceed to connecting the Auth, User, and Item microservices environment by environment.
