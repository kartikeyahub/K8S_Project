The network connection is working because PostgreSQL is responding at `192.168.56.15:5432`. The current issue is **PostgreSQL password authentication for&#x20;**`stage_app`.

Your second attempt failed even after entering a password, so let's reset the password on the `proddb` server and test again.

## **Step 1: Exit the temporary Kubernetes Pod**

Your current prompt is:

```
root@proddb-auth-test:/#
```

Run:

```
exit
```

## **Step 2: Log in to the proddb Ubuntu VM**

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

## **Step 3: Check the Stage user**

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

## **Step 4: Reset the Stage password**

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

## **Step 5: Test authentication again from Kubernetes**

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
