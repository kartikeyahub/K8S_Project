# KartikeyaSoft Microservices Frontend — V3.1 (API routing fix)

This package keeps the V3 dashboard design and corrects the Nginx URI rewriting for the Spring Boot controllers used by this project.

## Package contents

- `index.html` — V3 dashboard layout and forms
- `css/style.css` — responsive V3 styling
- `js/app.js` — registration, login, user-profile and item operations
- `nginx.conf` — same-origin reverse proxy with `/api` prefix rewriting
- `Dockerfile` — Nginx image build
- `.dockerignore` — excludes repository metadata and logs from the build context

## API routing

The browser keeps calling these same-origin URLs:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/users`
- `GET /api/users`
- `POST /api/items`
- `GET /api/items`

Nginx rewrites them for the existing Spring Boot controller mappings:

| Browser path | Backend path | Kubernetes Service |
|---|---|---|
| `/api/auth/register` | `/auth/register` | `auth-service:8080` |
| `/api/auth/login` | `/auth/login` | `auth-service:8080` |
| `/api/users` | `/users` | `user-service:8081` |
| `/api/items` | `/items` | `item-service:8082` |

The proxy targets use Kubernetes Service DNS names. The frontend Pod and all three backend Services must be in the same namespace (`micro-app` for the current manual deployment).

## Build the image (WSL)

Run from the directory containing this Dockerfile:

```bash
docker build -t kartikeyasoft/frontend:v3.1 .
docker login
docker push kartikeyasoft/frontend:v3.1
```

## Update the existing manual Kubernetes Deployment

This project deployment uses Kubernetes YAML and `kubectl` in namespace `micro-app` (not Helm).

On the Kubernetes master:

```bash
kubectl set image deployment/frontend \
  frontend=kartikeyasoft/frontend:v3.1 \
  -n micro-app

kubectl rollout status deployment/frontend \
  -n micro-app --timeout=180s

kubectl get deployment frontend -n micro-app \
  -o jsonpath='{.spec.template.spec.containers[0].image}{"\\n"}'

kubectl exec deployment/frontend -n micro-app -- nginx -t
```

Update `kubernetes/frontend/deployment.yaml` as well so the source manifest matches the running image:

```yaml
image: kartikeyasoft/frontend:v3.1
```

Do not change the existing Service. It currently exposes NodePort `30809` in the `micro-app` namespace.

## Browser test

Open the existing frontend URL, for example:

```text
http://192.168.56.12:30809
```

Use a hard refresh (`Ctrl+F5`). Test registration, login, user creation/listing and item creation/listing. Check the browser Network tab and confirm that API requests use `/api/...` and return the expected application responses.

## Notes

- The V3 visual design and frontend API request paths are retained.
- No Java service code or PostgreSQL configuration is changed by this package.
- If an API still returns 404, inspect the controller mappings and Nginx access/error logs before changing paths again.
- This package assumes the backend controller mappings are `/auth`, `/users` and `/items` as identified for this project.
