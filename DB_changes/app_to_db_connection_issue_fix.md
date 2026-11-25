Authentication failure

The connection is reaching your test DB server at `192.168.56.14:5432`. So this is not a Kubernetes networking or worker2 disk-pressure issue.

Let's correct the password mismatch.

### **Step 1: Check the password configured on testdb**

Log in to the testdb VM (`192.168.56.14`):

```
cd ~/postgres-db
docker compose ps
```

Connect to PostgreSQL as the administrator. Assuming the Compose service is named `postgres`:

```
docker exec -it testdb-postgres \
  psql -U postgres -d postgres
```

Run:

```
SELECT rolname, rolcanlogin
FROM pg_roles
WHERE rolname = 'test_app';
```

### **Step 2: Reset the test_app password**

Inside PostgreSQL:

```
ALTER ROLE test_app WITH LOGIN PASSWORD 'YOUR_NEW_STRONG_PASSWORD';
```

Use a new password that you will also configure in Kubernetes.

Then exit:

```
\q
```

### **Step 3: Update the Kubernetes Secret**

On the master:

```
kubectl create secret generic test-db-secret \
  --namespace=micro-app-test \
  --from-literal=DB_HOST=192.168.56.14 \
  --from-literal=DB_PORT=5432 \
  --from-literal=DB_NAME=test_auth_db \
  --from-literal=DB_USERNAME=test_app \
  --from-literal=DB_PASSWORD='YOUR_NEW_STRONG_PASSWORD' \
  --dry-run=client -o yaml | kubectl apply -f -
```

Use the exact same password you configured in PostgreSQL.

### **Step 4: Check your connectivity Pod configuration**

Confirm that the Pod reads the password from the Secret:


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
kubectl logs test-db-connectivity -n micro-app-test -f
```

**Expected result:** successful connection to `test_auth_db`.

### **Important: Check all three environment credentials**

Your test DB initialization script creates three application users. Verify that each PostgreSQL role password matches its corresponding Kubernetes Secret:

| Environment | PostgreSQL user | Kubernetes Secret |
| ----------- | --------------- | ----------------- |
| Dev         | `dev_app`       | `dev-db-secret`   |
| Test        | `test_app`      | `test-db-secret`  |
| QA          | `qa_app`        | `qa-db-secret`    |

Don't change the database initialization script or recreate the PostgreSQL data directory. We only need to synchronize the PostgreSQL role passwords and Kubernetes Secrets.


Remove the test Pod:

```
kubectl delete pod test-db-connectivity \
  -n micro-app-test

rm -f /tmp/test-db-connectivity.yaml
```
