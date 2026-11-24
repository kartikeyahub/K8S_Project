Good question. We are entering passwords in **two places because PostgreSQL has two different types of users**:

1. **PostgreSQL administrator (**`postgres`**)** – manages the PostgreSQL server.
2. **Application users (**`dev_app`**,&#x20;**`test_app`**,&#x20;**`qa_app`**)** – allow our microservices to connect to their respective databases.

They have different responsibilities and different passwords.

## **1.&#x20;**`.env`**&#x20;– PostgreSQL administrator password**

```
POSTGRES_VERSION=16
POSTGRES_USER=postgres
POSTGRES_PASSWORD=REPLACE_WITH_STRONG_ADMIN_PASSWORD
PGDATA=/var/lib/postgresql/data/pgdata
```

Here:

- `POSTGRES_USER=postgres` is the PostgreSQL administrator username.
- `POSTGRES_PASSWORD` is the administrator's password.
- This account is used to initialize and administer PostgreSQL.

For example, replace:

```
POSTGRES_PASSWORD=REPLACE_WITH_STRONG_ADMIN_PASSWORD
```

with a strong password that you create.

This password is used for administrative access, not for your Dev, Test or QA microservices.

## **2.&#x20;**`init/01-init-databases.sh`**&#x20;– Application user passwords**

```
CREATE USER dev_app WITH PASSWORD 'REPLACE_DEV_PASSWORD';
CREATE USER test_app WITH PASSWORD 'REPLACE_TEST_PASSWORD';
CREATE USER qa_app WITH PASSWORD 'REPLACE_QA_PASSWORD';
```

These commands create three separate application users.

Replace the placeholders with passwords you choose:

| Username   | Password purpose          | Database access |
| ---------- | ------------------------- | --------------- |
| `dev_app`  | Dev application password  | Dev databases   |
| `test_app` | Test application password | Test databases  |
| `qa_app`   | QA application password   | QA databases    |

For example, you could choose three different strong passwords.

The database ownership is then assigned:

```
CREATE DATABASE dev_auth_db OWNER dev_app;
CREATE DATABASE dev_user_db OWNER dev_app;
CREATE DATABASE dev_item_db OWNER dev_app;
```

This means `dev_app` owns all three Dev databases.

The same arrangement applies to Test and QA.

## **3. Why do we need two sets of passwords?**

**PostgreSQL administrator**

**postgres**

Administrator password comes from `.env`

Creates users and databases; manages PostgreSQL.

**Application users created by the initialization script**

**dev_app**

3 Dev DBs

**test_app**

3 Test DBs

**qa_app**

3 QA DBs

Each application user has its own password, separate from the administrator password.

This separation is important for security. Your Dev microservice should connect using `dev_app`, not the PostgreSQL administrator account.

## **4. When does each password get used?**

| Operation                       | Which password?                   |
| ------------------------------- | --------------------------------- |
| Initialize PostgreSQL container | `POSTGRES_PASSWORD`               |
| Create application users        | Administrator access (`postgres`) |
| Dev microservice connection     | `dev_app` password                |
| Test microservice connection    | `test_app` password               |
| QA microservice connection      | `qa_app` password                 |

The initialization script runs automatically when PostgreSQL initializes a **new, empty data directory**. It uses the administrator account to create the application users and databases.

**Important:** If you change the initialization script later and restart the container, PostgreSQL will not automatically recreate users or change their passwords. You must update existing users separately.

## **5. How does Kubernetes use these passwords?**

For example, Dev:

- `dev_app` username goes into `dev-db-secret`.
- The password you assigned to `dev_app` goes into `dev-db-secret`.
- Your Dev microservice reads those credentials from the Kubernetes Secret.

The `.env` administrator password is not needed by the application.

**In short:** You are not entering the same password twice. One password is for the PostgreSQL administrator; the other three are for application users. This is the correct separation for our Dev/Test/QA database setup.





## **Step 1: Log in to the proddb Ubuntu VM**

On the `proddb` VM, run:

```
cd ~/postgres-db
docker ps
```

Confirm that `proddb-postgres` is running.

Connect to PostgreSQL as administrator:

```
docker exec -it proddb-postgres \
  psql -U postgres -d postgres
```

## **Step 2: Check the Stage user**

Inside PostgreSQL:

```
\du
```

Confirm that `stage_app` exists.

Check database ownership:

```
SELECT
    datname,
    pg_catalog.pg_get_userbyid(datdba) AS owner
FROM pg_database
WHERE datname LIKE 'stage_%';
```

Expected:

| Database      | Owner     |
| ------------- | --------- |
| stage_auth_db | stage_app |
| stage_user_db | stage_app |
| stage_item_db | stage_app |

## **Step 3: Reset the Stage password**

Inside the PostgreSQL prompt, execute:

```
\password stage_app
```

Enter a new strong password twice when prompted.

Then exit:

```
\q
```

Do not share this password in chat.

## **Step 4: Test authentication again from Kubernetes**

On the Kubernetes master, start a temporary Pod:

```
kubectl run proddb-auth-test \
  --image=postgres:16 \
  --restart=Never \
  -it \
  --command -- bash
```

Inside the Pod:

```
export PGPASSWORD
read -rsp "Enter new stage_app password: " PGPASSWORD
echo
```

Now test:

```
psql -h 192.168.56.15 \
  -p 5432 \
  -U stage_app \
  -d stage_item_db \
  -c "SELECT current_database(), current_user, inet_server_addr();"
```

Expected result

```
 current_database | current_user | inet_server_addr
------------------+--------------+------------------
 stage_item_db    | stage_app    | ...
(1 row)
```

After testing:

```
unset PGPASSWORD
exit
```

**Important:** After the password reset succeeds, we must also update the `stage-db-secret` Kubernetes Secret with the new password. Otherwise, the Stage microservices will continue using the old password.

Complete Steps 1–5 and share the authentication result. We will update the Kubernetes Secret next.
