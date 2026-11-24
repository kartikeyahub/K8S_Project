Here is an initial note you can keep at the beginning of your PostgreSQL migration documentation. It explains the mandatory actions on the **Docker Compose PostgreSQL server side** and the **Kubernetes application side**, especially passwords, database creation, and Secret configuration.

# PostgreSQL Configuration – Mandatory Initial Actions

## 1. Architecture Overview

We are running PostgreSQL outside Kubernetes using Docker Compose on two separate Ubuntu VMs.

| Server | IP Address      | Environments      |
| ------ | --------------- | ----------------- |
| testdb | `192.168.56.14` | Dev, Test, QA     |
| proddb | `192.168.56.15` | Stage, Production |

PostgreSQL runs inside Docker containers, and Kubernetes microservices connect to these external PostgreSQL servers through their private IP addresses.

---

## 2. Docker Compose Side – Mandatory Actions

Perform these actions on the respective PostgreSQL VM before connecting Kubernetes applications.

### Action 1: Configure PostgreSQL administrator credentials

File: `.env`

```
POSTGRES_VERSION=16
POSTGRES_USER=postgres
POSTGRES_PASSWORD=YOUR_STRONG_ADMIN_PASSWORD
PGDATA=/var/lib/postgresql/data/pgdata
```

**Mandatory:**

- Choose a strong administrator password.
- Keep this password secure.
- Do not use the administrator password in application configuration.
- Do not commit `.env` to Git.

The `postgres` account is used for PostgreSQL administration and initial database setup.

### Action 2: Configure application user passwords

File: `init/01-init-databases.sh`

For testdb:

```
CREATE USER dev_app WITH PASSWORD 'YOUR_DEV_PASSWORD';
CREATE USER test_app WITH PASSWORD 'YOUR_TEST_PASSWORD';
CREATE USER qa_app WITH PASSWORD 'YOUR_QA_PASSWORD';
```

For proddb:

```
CREATE USER stage_app WITH PASSWORD 'YOUR_STAGE_PASSWORD';
CREATE USER prod_app WITH PASSWORD 'YOUR_PROD_PASSWORD';
```

**Mandatory:**

- Create a separate username and password for each environment.
- Use strong passwords.
- Do not reuse the PostgreSQL administrator password.
- Keep a secure record of which password belongs to each application user.

### Action 3: Create environment-specific databases

Each application user owns its respective databases.

| Environment | PostgreSQL user | Databases                                   |
| ----------- | --------------- | ------------------------------------------- |
| Dev         | dev_app         | dev_auth_db, dev_user_db, dev_item_db       |
| Test        | test_app        | test_auth_db, test_user_db, test_item_db    |
| QA          | qa_app          | qa_auth_db, qa_user_db, qa_item_db          |
| Stage       | stage_app       | stage_auth_db, stage_user_db, stage_item_db |
| Production  | prod_app        | prod_auth_db, prod_user_db, prod_item_db    |

Example:

```
CREATE DATABASE dev_auth_db OWNER dev_app;
CREATE DATABASE dev_user_db OWNER dev_app;
CREATE DATABASE dev_item_db OWNER dev_app;
```

**Mandatory:** Verify that each database has the correct owner.

### Action 4: Configure Docker Compose

- Bind PostgreSQL to the correct private IP address.
- Expose PostgreSQL port `5432`.
- Configure persistent storage using a Docker volume or host directory.
- Configure a PostgreSQL health check.
- Ensure the database container starts automatically.

Example:

```
ports:
  - "192.168.56.14:5432:5432"
```

For proddb, use:

```
ports:
  - "192.168.56.15:5432:5432"
```

### Action 5: Start and verify PostgreSQL

```
docker compose config --quiet
docker compose up -d
docker compose ps
docker logs testdb-postgres
```

Use the appropriate container name on each server.

Verify:

- Container is running and healthy.
- Databases are created.
- Application users exist.
- Database ownership is correct.
- PostgreSQL is listening on port 5432.

### Action 6: Test actual database authentication

Do not rely only on `pg_isready`. Test actual username/password authentication from a Kubernetes node or temporary Kubernetes Pod.

Example:

```
psql -h 192.168.56.14 \
  -p 5432 \
  -U dev_app \
  -d dev_item_db
```

Enter the `dev_app` password when prompted.

**Mandatory:** Confirm successful login before moving to Kubernetes application configuration.

---

## 3. Kubernetes Side – Mandatory Actions

After PostgreSQL setup and authentication are successful, configure Kubernetes.

### Action 1: Create namespaces

```
kubectl create namespace micro-app-dev
kubectl create namespace micro-app-test
kubectl create namespace micro-app-qa
kubectl create namespace micro-app-stage
kubectl create namespace micro-app-prod
```

### Action 2: Create Kubernetes Secrets

Create one Secret per environment.

| Namespace       | Secret name     | Database user |
| --------------- | --------------- | ------------- |
| micro-app-dev   | dev-db-secret   | dev_app       |
| micro-app-test  | test-db-secret  | test_app      |
| micro-app-qa    | qa-db-secret    | qa_app        |
| micro-app-stage | stage-db-secret | stage_app     |
| micro-app-prod  | prod-db-secret  | prod_app      |

Each Secret must contain:

| Key         | Example                                  |
| ----------- | ---------------------------------------- |
| DB_HOST     | 192.168.56.14 or 192.168.56.15           |
| DB_PORT     | 5432                                     |
| DB_NAME     | dev_item_db                              |
| DB_USERNAME | dev_app                                  |
| DB_PASSWORD | The matching application user's password |

**Mandatory:**

- Use the same application password configured in PostgreSQL.
- Do not use the `postgres` administrator password.
- Never put database passwords directly into Kubernetes Deployment YAML.
- Create the Secret in the same namespace as the application.

### Action 3: Configure application.properties

Use Spring Boot environment-variable placeholders:

```
spring.datasource.url=jdbc:postgresql://${DB_HOST}:${DB_PORT}/${DB_NAME}
spring.datasource.username=${DB_USERNAME}
spring.datasource.password=${DB_PASSWORD}
spring.datasource.driver-class-name=org.postgresql.Driver
```

The application gets the database connection details from Kubernetes environment variables.

### Action 4: Reference Secrets in Kubernetes Deployment

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
    valueFrom:
      secretKeyRef:
        name: dev-db-secret
        key: DB_NAME

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

For other environments, reference their respective Secret names.

### Action 5: Verify application connectivity

After deploying the application:

```
kubectl get pods -n micro-app-dev
kubectl logs deployment/item-service -n micro-app-dev
```

Verify that:

- The Pod starts successfully.
- The application connects to the correct external PostgreSQL server.
- Authentication succeeds.
- The application can access its assigned database.

---

## 4. Important Password Management Rules

| Password                  | Where configured      | Used by                  |
| ------------------------- | --------------------- | ------------------------ |
| PostgreSQL admin password | Docker Compose `.env` | PostgreSQL administrator |
| Dev DB password           | Initialization SQL    | dev_app                  |
| Test DB password          | Initialization SQL    | test_app                 |
| QA DB password            | Initialization SQL    | qa_app                   |
| Stage DB password         | Initialization SQL    | stage_app                |
| Production DB password    | Initialization SQL    | prod_app                 |

### If a database password changes

You must perform these actions:

1. Update the password for the PostgreSQL application user.
2. Update the matching Kubernetes Secret with the new password.
3. Restart the affected Kubernetes Deployment so its Pods load the updated environment variables.
4. Verify the application can connect successfully.

Example PostgreSQL password update:

```
\password dev_app
```

Example Kubernetes Secret update:

```
kubectl create secret generic dev-db-secret \
  -n micro-app-dev \
  --from-literal=DB_HOST=192.168.56.14 \
  --from-literal=DB_PORT=5432 \
  --from-literal=DB_NAME=dev_item_db \
  --from-literal=DB_USERNAME=dev_app \
  --from-literal=DB_PASSWORD='NEW_DEV_PASSWORD' \
  --dry-run=client -o yaml | kubectl apply -f -
```

Restart the affected Deployment:

```
kubectl rollout restart deployment/item-service -n micro-app-dev
```

Repeat for other affected services if they use the same database credentials.

---

## 5. Important Database Table Creation Note

Creating PostgreSQL users and databases does not automatically create application tables.

For Spring Boot microservices, use Flyway database migrations to create and maintain tables.

Recommended database mapping:

| Microservice | Database |
| ------------ | -------- |
| Auth Service | auth_db  |
| User Service | user_db  |
| Item Service | item_db  |

Each service should have its own database and migration scripts.

---

## 6. Final Mandatory Checklist

### Docker Compose PostgreSQL side

- PostgreSQL administrator password configured.
- Separate application passwords configured.
- All required databases created.
- Correct database ownership verified.
- Persistent storage configured.
- PostgreSQL container healthy.
- Port 5432 reachable from Kubernetes.
- Actual username/password authentication tested.

### Kubernetes side

- Environment namespaces created.
- Kubernetes Secrets created for all environments.
- Secret passwords match PostgreSQL application passwords.
- Spring Boot application.properties configured.
- Deployments reference the correct Secrets.
- Application connectivity verified.
- Database table migrations configured and tested.

**Golden Rule:** The PostgreSQL application user's password and its corresponding Kubernetes Secret password must always match. The PostgreSQL administrator password is separate and must never be used by application microservices.

**One additional recommendation:** Keep this note as the prerequisite section of your main Kubernetes migration article. Complete and verify the Docker Compose database setup first, then proceed to Kubernetes Secrets and application deployments.
