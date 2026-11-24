# KartikeyaSoft Microservices Frontend — Design V3

Responsive microservices console for Auth, User and Item APIs.

## Files
- `index.html` — dashboard layout and forms
- `css/style.css` — responsive visual design
- `js/app.js` — existing API operations and UI interactions
- `nginx.conf` — same-origin reverse proxy to the three backend Services
- `Dockerfile` — Nginx image build

## Build
```bash
docker build -t kartikeyasoft/frontend:v3 .
```

## Push
```bash
docker push kartikeyasoft/frontend:v3
```

## Deploy to Dev with Helm
```bash
helm upgrade frontend ./helm/frontend \
  --namespace micro-app-dev \
  -f ./helm/frontend/values-dev.yaml \
  --set image.tag=v3
```

The chart expects a NodePort Service in the target namespace. Verify the actual NodePort and backend Service endpoints before browser testing.

## API routes
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/users`
- `GET /api/users`
- `POST /api/items`
- `GET /api/items`

Nginx proxies these paths to the same-namespace Kubernetes Services `auth-service:8080`, `user-service:8081`, and `item-service:8082`.
