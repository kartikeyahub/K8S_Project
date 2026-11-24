Below is a complete, beginner-friendly article covering the **external PostgreSQL 16 setup on the&#x20;**`testdb`**&#x20;Ubuntu VM**, from initial server preparation through Docker deployment, database creation, Kubernetes connectivity, and Kubernetes Secret configuration.

# External PostgreSQL 16 Configuration Using Docker for Kubernetes

## 1. Introduction

This article explains how to configure an external PostgreSQL database server using Docker Compose and connect it to a Kubernetes cluster.

Instead of running PostgreSQL inside Kubernetes, we maintain PostgreSQL on a separate Ubuntu VM. Kubernetes microservices connect to the external database using the VM's private IP address.

### Architecture

| Component         | Details         |
| ----------------- | --------------- |
| Database VM       | testdb          |
| Operating System  | Ubuntu 22.04    |
| Database          | PostgreSQL 16   |
| Container Runtime | Docker          |
| Deployment        | Docker Compose  |
| Database IP       | `192.168.56.14` |
| PostgreSQL Port   | `5432`          |
| Project Directory | `~/postgres-db` |

### Environment and database design

The `testdb` server hosts three environments.

| Environment | Namespace      | Database user | Databases                                |
| ----------- | -------------- | ------------- | ---------------------------------------- |
| Dev         | micro-app-dev  | dev_app       | dev_auth_db, dev_user_db, dev_item_db    |
| Test        | micro-app-test | test_app      | test_auth_db, test_user_db, test_item_db |
| QA          | micro-app-qa   | qa_app        | qa_auth_db, qa_user_db, qa_item_db       |

Each environment has a separate database user. That user owns its three databases.

---

## 2. Verify the Ubuntu server

Log in to the `testdb` VM.

Check the operating system:

```
cat /etc/os-release
```

Check the IP address:

```
ip addr
```

Confirm the private network interface has this address:

```
192.168.56.14
```

Check available memory and disk:

```
free -h
df -h
```

---

## 3. Install Docker

Update the Ubuntu packages:

```
sudo apt update
sudo apt upgrade -y
```

Install Docker:

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
```

Verify Docker Compose:

```
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

The project structure:

```
postgres-db/
│
├── .env
│
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

| Folder/File           | Purpose                                             |
| --------------------- | --------------------------------------------------- |
| `.env`                | PostgreSQL configuration and administrator password |
| `docker-compose.yaml` | PostgreSQL container configuration                  |
| `init/`               | Initial database and user creation script           |
| `data/`               | Persistent PostgreSQL database files                |
| `backup/`             | Database backup storage                             |

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

Replace the password with a strong, unique password.

Save the file.

Protect it:

```
chmod 600 .env
```

**Important:** Never upload this file to GitHub or share it publicly.

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

echo "Creating application users and databases..."

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname postgres <<'SQL'

-- Create application users

CREATE USER dev_app WITH PASSWORD 'REPLACE_DEV_PASSWORD';
CREATE USER test_app WITH PASSWORD 'REPLACE_TEST_PASSWORD';
CREATE USER qa_app WITH PASSWORD 'REPLACE_QA_PASSWORD';

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

echo "Databases and users created successfully."
```

Replace all three application passwords with strong, unique passwords.

Save the file.

### Important initialization behavior

The official PostgreSQL Docker image executes scripts in `/docker-entrypoint-initdb.d/` only when the PostgreSQL data directory is initialized for the first time.

If the `data/` directory already contains an initialized database, changing this script and restarting the container will not automatically create new users or databases.

For an existing installation, create or modify databases and users using SQL commands instead.

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

- `image`: Uses PostgreSQL 16.
- `container_name`: Names the container `testdb-postgres`.
- `restart`: Automatically restarts the container when needed.
- `env_file`: Loads PostgreSQL environment variables.
- `ports`: Exposes PostgreSQL on the private VM IP and port 5432.
- `data`: Persists database files outside the container.
- `init`: Mounts the initial database creation script.
- `healthcheck`: Checks PostgreSQL readiness.

---

## 8. Configure folder permissions

The official PostgreSQL container runs PostgreSQL as a non-root user, normally UID 999.

Configure the data directory:

```
sudo chown -R 999:999 ~/postgres-db/data
sudo chmod 700 ~/postgres-db/data
```

Configure the initialization directory:

```
sudo chown -R ks:999 ~/postgres-db/init
sudo chmod 750 ~/postgres-db/init
sudo chmod 750 ~/postgres-db/init/01-init-databases.sh
```

Replace `ks` with your actual Ubuntu username if different.

These permissions allow the PostgreSQL container to read the initialization script and write database files.

---

## 9. Validate Docker Compose configuration

Move into the project directory:

```
cd ~/postgres-db
```

Validate the configuration:

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

Start the PostgreSQL container:

```
docker compose up -d
```

Check container status:

```
docker compose ps
```

Expected status:

```
NAME              IMAGE         STATUS
testdb-postgres   postgres:16   Up (healthy)
```

Check logs:

```
docker logs testdb-postgres
```

Look for:

```
Creating application users and databases...
CREATE ROLE
CREATE ROLE
CREATE ROLE
CREATE DATABASE
...
Databases and users created successfully.
database system is ready to accept connections
```

---

## 11. Verify PostgreSQL databases

Connect to PostgreSQL as administrator:

```
docker exec -it testdb-postgres \
  psql -U postgres -d postgres
```

List databases:

```
\l
```

List database users:

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

Expected database ownership:

| Database     | Owner    |
| ------------ | -------- |
| dev_auth_db  | dev_app  |
| dev_user_db  | dev_app  |
| dev_item_db  | dev_app  |
| test_auth_db | test_app |
| test_user_db | test_app |
| test_item_db | test_app |
| qa_auth_db   | qa_app   |
| qa_user_db   | qa_app   |
| qa_item_db   | qa_app   |

Exit:

```
\q
```

---

## 12. Verify PostgreSQL network connectivity

The Kubernetes master must be able to reach the external database server.

On the Kubernetes master, run:

```
ping -c 3 192.168.56.14
```

Check PostgreSQL port:

```
nc -vz 192.168.56.14 5432
```

Expected:

```
Connection to 192.168.56.14 5432 port [tcp/postgresql] succeeded!
```

If `nc` is not installed:

```
sudo apt install -y netcat-openbsd
```

---

## 13. Test PostgreSQL connectivity from Kubernetes

Run a temporary PostgreSQL client Pod:

```
kubectl run db-connectivity-test \
  --image=postgres:16 \
  --restart=Never \
  --rm -it \
  --command -- \
  pg_isready \
  -h 192.168.56.14 \
  -p 5432 \
  -U dev_app \
  -d dev_item_db
```

Expected:

```
192.168.56.14:5432 - accepting connections
```

This verifies that a Kubernetes Pod can reach PostgreSQL.

### Test actual authentication

For a secure interactive test, start a temporary client Pod:

```
kubectl run db-auth-test \
  --image=postgres:16 \
  --restart=Never \
  -it \
  --command -- \
  bash
```

Inside the Pod:

```
export PGPASSWORD
read -rsp "Enter dev_app password: " PGPASSWORD
echo
```

Connect:

```
psql -h 192.168.56.14 \
  -p 5432 \
  -U dev_app \
  -d dev_item_db \
  -c "SELECT current_database(), current_user, inet_server_addr();"
```

After testing:

```
unset PGPASSWORD
exit
```

Delete the temporary Pod if it remains:

```
kubectl delete pod db-auth-test -n default --ignore-not-found
```

The `inet_server_addr()` output may show a Docker container IP such as `172.18.0.2`. That is normal. Kubernetes connects to the VM using `192.168.56.14:5432`.

---

## 14. Configure Kubernetes namespaces

Create the Dev, Test, and QA namespaces:

```
kubectl create namespace micro-app-dev
kubectl create namespace micro-app-test
kubectl create namespace micro-app-qa
```

If a namespace already exists, Kubernetes reports `AlreadyExists`; that is fine.

Verify:

```
kubectl get namespaces
```

---

## 15. Create Kubernetes Secrets

Kubernetes Secrets store database connection information separately from application manifests.

We use the following keys:

- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USERNAME`
- `DB_PASSWORD`

### Dev Secret

```
read -rsp "Enter dev_app password: " DB_PASSWORD
echo

kubectl create secret generic dev-db-secret \
  -n micro-app-dev \
  --from-literal=DB_HOST=192.168.56.14 \
  --from-literal=DB_PORT=5432 \
  --from-literal=DB_NAME=dev_item_db \
  --from-literal=DB_USERNAME=dev_app \
  --from-literal=DB_PASSWORD="$DB_PASSWORD"

unset DB_PASSWORD
```

### Test Secret

```
read -rsp "Enter test_app password: " DB_PASSWORD
echo

kubectl create secret generic test-db-secret \
  -n micro-app-test \
  --from-literal=DB_HOST=192.168.56.14 \
  --from-literal=DB_PORT=5432 \
  --from-literal=DB_NAME=test_item_db \
  --from-literal=DB_USERNAME=test_app \
  --from-literal=DB_PASSWORD="$DB_PASSWORD"

unset DB_PASSWORD
```

### QA Secret

```
read -rsp "Enter qa_app password: " DB_PASSWORD
echo

kubectl create secret generic qa-db-secret \
  -n micro-app-qa \
  --from-literal=DB_HOST=192.168.56.14 \
  --from-literal=DB_PORT=5432 \
  --from-literal=DB_NAME=qa_item_db \
  --from-literal=DB_USERNAME=qa_app \
  --from-literal=DB_PASSWORD="$DB_PASSWORD"

unset DB_PASSWORD
```

Enter the actual current password for each PostgreSQL user.

### Verify Secrets

```
kubectl describe secret dev-db-secret -n micro-app-dev

kubectl describe secret test-db-secret -n micro-app-test

kubectl describe secret qa-db-secret -n micro-app-qa
```

Expected keys:

```
DB_HOST
DB_NAME
DB_PASSWORD
DB_PORT
DB_USERNAME
```

Do not use `kubectl get secret -o yaml` when sharing output because it displays base64-encoded values.

---

## 16. Connect Spring Boot microservices to PostgreSQL

For example, the Dev Item Service can use the following Spring Boot configuration:

```
spring.datasource.url=jdbc:postgresql://${DB_HOST}:${DB_PORT}/${DB_NAME}
spring.datasource.username=${DB_USERNAME}
spring.datasource.password=${DB_PASSWORD}

spring.datasource.driver-class-name=org.postgresql.Driver
```

The Kubernetes Deployment should map the Secret values into environment variables.

Example:

```
env:
  - name: DB_HOST
    valueFrom:
      secretKeyRef:
        name: dev-db-secret
        key: DB_HOST

  - name: DB_PORT
    valueFrom:
      secretKeyRef:
        name: dev-db-secret
        key: DB_PORT

  - name: DB_NAME
    value: dev_item_db

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

Use the correct Secret and database name for each service and namespace.

For example:

| Service      | Dev database |
| ------------ | ------------ |
| Auth Service | dev_auth_db  |
| User Service | dev_user_db  |
| Item Service | dev_item_db  |

The same pattern applies to Test and QA.

---

## 17. Backup PostgreSQL databases

Create a backup directory:

```
mkdir -p ~/postgres-db/backup
```

Back up an individual database:

```
docker exec testdb-postgres \
  pg_dump -U postgres -d dev_item_db \
  > ~/postgres-db/backup/dev_item_db.sql
```

Check the backup:

```
ls -lh ~/postgres-db/backup/
```

Restore an individual database:

```
cat ~/postgres-db/backup/dev_item_db.sql | \
docker exec -i testdb-postgres \
  psql -U postgres -d dev_item_db
```

For a real backup strategy, use scheduled backups, retain multiple copies, and store a copy outside the database VM. Test restores regularly.

---

## 18. Important security considerations

1. Use strong, unique passwords for every database user.
2. Never commit `.env` or initialization scripts containing passwords to Git.
3. Restrict PostgreSQL port `5432` to trusted Kubernetes nodes and application networks.
4. Kubernetes Secrets are base64-encoded by default, not automatically encrypted. Configure API server encryption at rest and restrictive RBAC.
5. Consider an external secret manager for production environments.
6. Avoid exposing PostgreSQL to public networks.
7. Keep regular database backups and test recovery.
8. Do not delete the `data/` directory during troubleshooting.
9. Do not use `docker compose down -v` unless intentionally destroying persistent data.

---

## 19. Final verification checklist

| Task                        | Expected result             |
| --------------------------- | --------------------------- |
| Ubuntu preparation          | Completed                   |
| Docker installation         | Installed and running       |
| PostgreSQL 16               | Container running           |
| Docker Compose              | Configuration valid         |
| Persistent storage          | `data/` directory mounted   |
| Initialization script       | Users and databases created |
| Dev databases               | 3 created                   |
| Test databases              | 3 created                   |
| QA databases                | 3 created                   |
| PostgreSQL network          | Port 5432 reachable         |
| Kubernetes Pod connectivity | Successful                  |
| Dev Kubernetes Secret       | Created                     |
| Test Kubernetes Secret      | Created                     |
| QA Kubernetes Secret        | Created                     |
| Spring Boot configuration   | Ready for integration       |

## 20. Final architecture

```
                 Kubernetes Cluster
             -------------------------
             |                       |
             |   Master              |
             |   Worker 1            |
             |   Worker 2            |
             |   Worker 3            |
             |                       |
             -------------------------
                        |
                        |
              PostgreSQL Connection
                 192.168.56.14:5432
                        |
                        v
             -------------------------
             |       testdb          |
             |                       |
             |   Docker Container    |
             |   PostgreSQL 16       |
             |                       |
             |   dev_auth_db         |
             |   dev_user_db         |
             |   dev_item_db         |
             |                       |
             |   test_auth_db        |
             |   test_user_db        |
             |   test_item_db        |
             |                       |
             |   qa_auth_db          |
             |   qa_user_db          |
             |   qa_item_db          |
             -------------------------
```

**Result:** The external PostgreSQL server is configured with Docker Compose, persistent storage, separate Dev/Test/QA database users, nine databases, Kubernetes connectivity, and environment-specific Kubernetes Secrets.

The same architecture can be extended to the `proddb` server at `192.168.56.15` for Stage and Production.

**Current project status:** Your TestDB setup, Dev/Test/QA database creation, Kubernetes connectivity, and all three environment Secrets have been completed and verified. The next article can cover the `proddb` configuration for Stage and Production using the same approach.
