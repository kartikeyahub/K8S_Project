# KartikeyaSoft Microservices Frontend – V2.1 (API routing fix)

This package preserves the V2 dashboard HTML, CSS and JavaScript and fixes the Nginx reverse-proxy paths for the existing Spring Boot controllers.

## API path mapping

The browser continues to call these same-origin URLs:

| Browser request | Nginx forwards to |
|---|---|
| `POST /api/auth/register` | `auth-service:8080/auth/register` |
| `POST /api/auth/login` | `auth-service:8080/auth/login` |
| `GET/POST /api/users` | `user-service:8081/users` |
| `GET/POST /api/items` | `item-service:8082/items` |

The `/api` prefix is intentionally removed by Nginx because the Spring controllers use `/auth`, `/users` and `/items` as their class-level mappings.

## Files

```text
frontend-v2.1/
├── Dockerfile
├── .dockerignore
├── nginx.conf
├── index.html
├── css/
│   └── style.css
└── js/
    └── app.js
```

## Build and push

From the directory containing this README:

```bash
docker build -t kartikeyasoft/frontend:v2.1 .
docker push kartikeyasoft/frontend:v2.1
```

## Update the existing manual Kubernetes deployment

This project is using the `micro-app` namespace and the existing Frontend NodePort Service. Do not use Helm for this deployment.

```bash
kubectl set image deployment/frontend \\
  frontend=kartikeyasoft/frontend:v2.1 \\
  -n micro-app

kubectl rollout status deployment/frontend -n micro-app --timeout=180s
```

Check the running image and Nginx syntax:

```bash
kubectl get deployment frontend -n micro-app \\
  -o jsonpath='{.spec.template.spec.containers[0].image}{"\\n"}'

kubectl exec deployment/frontend -n micro-app -- nginx -t
```

## API smoke tests

The Spring controllers expose health endpoints. Run from the Kubernetes master:

```bash
curl -i http://192.168.56.12:30809/api/auth/health
curl -i http://192.168.56.12:30809/api/users/health
curl -i http://192.168.56.12:30809/api/items/health
```

Expected response bodies include `Auth Service is UP`, `User Service is UP` and `Item Service is UP` respectively. These tests verify the Nginx routes without creating database records.

Then test Register, Login, Create User, List Users, Add Item and List Items in the browser.
