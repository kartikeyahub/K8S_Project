# Deploy Frontend Using Helm in Kubernetes – Dev, Test and QA

## 1. Introduction

In this implementation, we convert the existing Frontend Kubernetes Deployment and Service YAML manifests into an independent Helm chart.

We will deploy the Frontend into three Kubernetes environments:

- Development
- Testing
- Quality Assurance

Each environment will have its own Kubernetes namespace and independent Helm release.

We will maintain one reusable Helm chart with separate environment-specific values files.

For external access, we will use Kubernetes NodePort instead of LoadBalancer because our Kubernetes cluster is running on VirtualBox and does not currently have a LoadBalancer implementation configured.

This approach allows us to deploy, upgrade and manage the Frontend independently in each environment.

## 2. Architecture Overview

### 2.1 Kubernetes Environment Configuration

| Environment | Namespace      | NodePort |
| ----------- | -------------- | -------- |
| Dev         | micro-app-dev  | 30080    |
| Test        | micro-app-test | 30081    |
| QA          | micro-app-qa   | 30082    |

### 2.2 Application Configuration

| Component          | Configuration                 |
| ------------------ | ----------------------------- |
| Application        | Frontend                      |
| Docker image       | kartikeyasoft/frontend:latest |
| Container port     | 80                            |
| Kubernetes Service | NodePort                      |
| Service port       | 80                            |
| Dev NodePort       | 30080                         |
| Test NodePort      | 30081                         |
| QA NodePort        | 30082                         |
| Replicas           | 1                             |

### 2.3 Kubernetes Node Information

Our VirtualBox Kubernetes cluster uses the following network:

| Node    | IP address    |
| ------- | ------------- |
| Master  | 192.168.56.10 |
| Worker1 | 192.168.56.11 |
| Worker2 | 192.168.56.12 |
| Worker3 | 192.168.56.13 |

A NodePort Service can be accessed through a reachable node IP and its assigned NodePort.

For example:

```
Dev  : http://192.168.56.10:30080
Test : http://192.168.56.10:30081
QA   : http://192.168.56.10:30082
```

These URLs assume that the relevant NodePorts are available and that host-only networking and firewall rules permit access.

### 2.4 Architecture Diagram

```
                       Windows Host
                            |
                     VirtualBox Network
                            |
                   Kubernetes Cluster
                            |
                     Frontend Helm
                            |
             +--------------+--------------+
             |              |              |
            Dev            Test            QA
             |              |              |
       micro-app-dev  micro-app-test  micro-app-qa
             |              |              |
       Frontend Pod   Frontend Pod   Frontend Pod
          Port 80       Port 80       Port 80
             |              |              |
        NodePort        NodePort        NodePort
         30080           30081           30082
             |              |              |
             +--------------+--------------+
                            |
                    Browser Access
```

## 3. Prerequisites

### 3.1 Kubernetes Cluster

Check Kubernetes nodes:

```
kubectl get nodes -o wide
```

All cluster nodes should be in the `Ready` state.

### 3.2 Helm Installation

Check Helm:

```
helm version --short
```

Helm should be accessible from the Kubernetes master node.

### 3.3 Kubernetes Namespaces

Verify the application namespaces:

```
kubectl get namespaces
```

Required namespaces:

```
micro-app-dev
micro-app-test
micro-app-qa
```

Create them only if they do not already exist:

```
kubectl create namespace micro-app-dev
kubectl create namespace micro-app-test
kubectl create namespace micro-app-qa
```

## 4. Existing Kubernetes Frontend Configuration

Before converting the existing Kubernetes manifests into Helm templates, our original Frontend Deployment was configured as follows.

### 4.1 Original Deployment

File:

```
kubernetes/frontend/deployment.yaml
```

Existing configuration:

```
apiVersion: apps/v1
kind: Deployment

metadata:
  name: frontend
  namespace: micro-app

spec:
  replicas: 1

  selector:
    matchLabels:
      app: frontend

  template:
    metadata:
      labels:
        app: frontend

    spec:
      containers:
        - name: frontend

          image: kartikeyasoft/frontend:latest

          imagePullPolicy: Always

          ports:
            - name: http
              containerPort: 80

          resources:
            requests:
              cpu: 100m
              memory: 128Mi

            limits:
              cpu: 300m
              memory: 256Mi

          startupProbe:
            tcpSocket:
              port: http
            periodSeconds: 10
            failureThreshold: 30

          readinessProbe:
            tcpSocket:
              port: http
            periodSeconds: 10

          livenessProbe:
            tcpSocket:
              port: http
            periodSeconds: 20
```

### 4.2 Original Service

File:

```
kubernetes/frontend/service.yaml
```

Existing configuration:

```
apiVersion: v1
kind: Service

metadata:
  name: frontend
  namespace: micro-app

spec:
  type: LoadBalancer

  selector:
    app: frontend

  ports:
    - name: http
      port: 80
      targetPort: 80
      protocol: TCP
```

### 4.3 Why We Are Changing LoadBalancer to NodePort

Our existing Kubernetes Service showed:

```
NAME      TYPE          CLUSTER-IP      EXTERNAL-IP
frontend  LoadBalancer  10.104.38.80    <pending>
```

This happens because our VirtualBox cluster does not currently have a LoadBalancer implementation configured.

For this lab, we will use NodePort instead.

The new configuration will be:

```
type: NodePort
```

Each environment will use a different NodePort.

| Environment | NodePort |
| ----------- | -------- |
| Dev         | 30080    |
| Test        | 30081    |
| QA          | 30082    |

The application container continues listening on port 80. Only the external Kubernetes Service access port changes.

## 5. Create the Frontend Helm Chart

Run the following commands on the Kubernetes master node.

Navigate to the project directory:

```
cd ~/Micro_App_Doc
```

Create the Helm chart directory:

```
mkdir -p helm/frontend/templates

cd helm/frontend
```

### 5.1 Final Directory Structure

Our Frontend Helm chart will have the following structure:

```
frontend/
│
├── Chart.yaml
│
├── values.yaml
├── values-dev.yaml
├── values-test.yaml
├── values-qa.yaml
│
└── templates/
    ├── _helpers.tpl
    ├── deployment.yaml
    └── service.yaml
```

## 6. Create Chart.yaml

File:

```
helm/frontend/Chart.yaml
```

Configuration:

```
apiVersion: v2

name: frontend

description: Helm chart for Micro App frontend

type: application

version: 0.1.0

appVersion: "1.0.0"
```

Explanation:

| Field       | Description                  |
| ----------- | ---------------------------- |
| apiVersion  | Helm chart API version       |
| name        | Chart name                   |
| description | Purpose of the chart         |
| type        | Application chart            |
| version     | Helm chart version           |
| appVersion  | Application version metadata |

## 7. Create values.yaml

File:

```
helm/frontend/values.yaml
```

This file contains the common Frontend configuration.

```
replicaCount: 1

image:
  repository: kartikeyasoft/frontend
  tag: latest
  pullPolicy: Always

containerPort: 80

service:
  type: NodePort
  port: 80
  nodePort: 30080

resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 300m
    memory: 256Mi

probes:
  startup:
    periodSeconds: 10
    failureThreshold: 30
  readiness:
    periodSeconds: 10
  liveness:
    periodSeconds: 20
```

### 7.1 Explanation of values.yaml

| Parameter        | Purpose                            |
| ---------------- | ---------------------------------- |
| replicaCount     | Number of Frontend replicas        |
| image.repository | Docker image repository            |
| image.tag        | Docker image tag                   |
| image.pullPolicy | Kubernetes image pull policy       |
| containerPort    | Application listening port         |
| service.type     | Kubernetes Service type            |
| service.port     | Kubernetes Service port            |
| service.nodePort | External NodePort                  |
| resources        | CPU and memory requests and limits |
| probes           | Application health-check settings  |

## 8. Create Environment-Specific Values Files

We use separate configuration files for Dev, Test and QA.

### 8.1 Dev – values-dev.yaml

File:

```
helm/frontend/values-dev.yaml
```

Configuration:

```
environment: dev

service:
  type: NodePort
  port: 80
  nodePort: 30080
```

Dev configuration:

```
Namespace: micro-app-dev

Image:
kartikeyasoft/frontend:latest

Container port:
80

Service type:
NodePort

NodePort:
30080
```

### 8.2 Test – values-test.yaml

File:

```
helm/frontend/values-test.yaml
```

Configuration:

```
environment: test

service:
  type: NodePort
  port: 80
  nodePort: 30081
```

Test configuration:

```
Namespace: micro-app-test

Image:
kartikeyasoft/frontend:latest

Container port:
80

Service type:
NodePort

NodePort:
30081
```

### 8.3 QA – values-qa.yaml

File:

```
helm/frontend/values-qa.yaml
```

Configuration:

```
environment: qa

service:
  type: NodePort
  port: 80
  nodePort: 30082
```

QA configuration:

```
Namespace: micro-app-qa

Image:
kartikeyasoft/frontend:latest

Container port:
80

Service type:
NodePort

NodePort:
30082
```

The chart uses the same Docker image and application configuration for all three environments.

Only the environment label and NodePort differ.

## 9. Create Helm Templates

### 9.1 Create \_helpers.tpl

File:

```
helm/frontend/templates/_helpers.tpl
```

Configuration:

```
{{- define "frontend.fullname" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{- define "frontend.selectorLabels" -}}
app.kubernetes.io/name: frontend
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "frontend.labels" -}}
{{ include "frontend.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
environment: {{ .Values.environment | default "unknown" | quote }}
{{- end }}
```

Explanation:

Helper templates generate common Kubernetes resource names and labels.

For our implementation, the Helm release name is:

```
frontend
```

Therefore, the generated Kubernetes resources are:

```
Deployment: frontend
Service: frontend
```

### 9.2 Create deployment.yaml

File:

```
helm/frontend/templates/deployment.yaml
```

Configuration:

```
apiVersion: apps/v1
kind: Deployment

metadata:
  name: {{ include "frontend.fullname" . }}

  labels:
    {{- include "frontend.labels" . | nindent 4 }}

spec:
  replicas: {{ .Values.replicaCount }}

  selector:
    matchLabels:
      {{- include "frontend.selectorLabels" . | nindent 6 }}

  template:
    metadata:
      labels:
        {{- include "frontend.labels" . | nindent 8 }}

    spec:
      containers:
        - name: frontend

          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"

          imagePullPolicy: {{ .Values.image.pullPolicy }}

          ports:
            - name: http
              containerPort: {{ .Values.containerPort }}
              protocol: TCP

          resources:
            {{- toYaml .Values.resources | nindent 12 }}

          startupProbe:
            tcpSocket:
              port: http
            periodSeconds: {{ .Values.probes.startup.periodSeconds }}
            failureThreshold: {{ .Values.probes.startup.failureThreshold }}

          readinessProbe:
            tcpSocket:
              port: http
            periodSeconds: {{ .Values.probes.readiness.periodSeconds }}

          livenessProbe:
            tcpSocket:
              port: http
            periodSeconds: {{ .Values.probes.liveness.periodSeconds }}
```

Important points:

- The Docker image is configurable through Helm values.
- The container listens on port 80.
- Resource requests and limits are preserved from the original Deployment.
- Startup, readiness and liveness probes are preserved.
- The namespace is not hardcoded.

### 9.3 Create service.yaml

File:

```
helm/frontend/templates/service.yaml
```

Configuration:

```
apiVersion: v1
kind: Service

metadata:
  name: {{ include "frontend.fullname" . }}

  labels:
    {{- include "frontend.labels" . | nindent 4 }}

spec:
  type: {{ .Values.service.type }}

  selector:
    {{- include "frontend.selectorLabels" . | nindent 4 }}

  ports:
    - name: http
      port: {{ .Values.service.port }}
      targetPort: http
      protocol: TCP
      {{- if and (eq .Values.service.type "NodePort") .Values.service.nodePort }}
      nodePort: {{ .Values.service.nodePort }}
      {{- end }}
```

Explanation:

The Service uses:

```
Service type: NodePort
Service port: 80
Container port: 80
```

The NodePort is supplied through the environment-specific values file.

For example:

```
Dev  : 30080
Test : 30081
QA   : 30082
```

### 9.4 Namespace configuration

We do not hardcode `metadata.namespace` in the Deployment or Service templates.

Helm automatically uses the namespace specified during installation.

For example:

```
--namespace micro-app-dev
```

This allows us to reuse the same chart in all three environments.

## 10. Validate Frontend Helm Chart

Navigate to:

```
cd ~/Micro_App_Doc/helm/frontend
```

### 10.1 Verify directory structure

```
find . -maxdepth 2 -type f | sort
```

Expected:

```
./Chart.yaml
./templates/_helpers.tpl
./templates/deployment.yaml
./templates/service.yaml
./values-dev.yaml
./values-qa.yaml
./values-test.yaml
./values.yaml
```

### 10.2 Run Helm lint

```
helm lint .
```

Actual validation result from our implementation:

```
==> Linting .
[INFO] Chart.yaml: icon is recommended

1 chart(s) linted, 0 chart(s) failed
```

The icon message is only a recommendation.

### 10.3 Render Dev configuration

```
helm template frontend . \
  --namespace micro-app-dev \
  -f values-dev.yaml
```

Verify:

| Setting        | Expected                      |
| -------------- | ----------------------------- |
| Deployment     | frontend                      |
| Image          | kartikeyasoft/frontend:latest |
| Container port | 80                            |
| Service type   | NodePort                      |
| Service port   | 80                            |
| NodePort       | 30080                         |
| Replicas       | 1                             |

### 10.4 Render Test configuration

```
helm template frontend . \
  --namespace micro-app-test \
  -f values-test.yaml
```

Verify:

```
environment: "test"
nodePort: 30081
```

### 10.5 Render QA configuration

```
helm template frontend . \
  --namespace micro-app-qa \
  -f values-qa.yaml
```

Verify:

```
environment: "qa"
nodePort: 30082
```

These commands render Kubernetes manifests without creating any resources.

## 11. Check NodePort Availability

Before installing Frontend in Kubernetes, verify that the selected NodePorts are not already in use.

Run:

```
kubectl get services -A \
  -o custom-columns='NAMESPACE:.metadata.namespace,NAME:.metadata.name,TYPE:.spec.type,NODEPORTS:.spec.ports[*].nodePort'
```

Confirm that these NodePorts are available:

```
30080
30081
30082
```

NodePorts are allocated across the entire Kubernetes cluster, not separately per namespace.

Our previous Frontend Service in the `micro-app` namespace had NodePort `30809`. We will preserve that existing Service until the new Frontend deployments are validated.

## 12. Deploy Frontend in Dev

Navigate to:

```
cd ~/Micro_App_Doc/helm/frontend
```

Install the chart:

```
helm upgrade --install frontend . \
  --namespace micro-app-dev \
  -f values-dev.yaml
```

Expected:

```
NAME: frontend
NAMESPACE: micro-app-dev
STATUS: deployed
```

### 12.1 Verify Helm release

```
helm list -n micro-app-dev

helm status frontend -n micro-app-dev
```

### 12.2 Verify Kubernetes resources

```
kubectl get deployments,pods,services -n micro-app-dev
```

Expected Frontend Deployment:

```
deployment.apps/frontend   1/1   1   1
```

Expected Service type:

```
frontend   NodePort
```

### 12.3 Check rollout

```
kubectl rollout status deployment/frontend \
  -n micro-app-dev --timeout=180s
```

Expected:

```
deployment "frontend" successfully rolled out
```

### 12.4 Check Pod status

```
kubectl get pods -n micro-app-dev -o wide
```

Expected:

```
READY   STATUS
1/1     Running
```

### 12.5 Check application logs

```
kubectl logs deployment/frontend \
  -n micro-app-dev --tail=100
```

Check for container startup errors.

### 12.6 Verify NodePort

```
kubectl get service frontend \
  -n micro-app-dev -o wide
```

Expected:

```
TYPE       PORT(S)
NodePort   80:30080/TCP
```

### 12.7 Access Frontend from Windows

Open a browser on your Windows system:

```
http://192.168.56.10:30080
```

The browser should display the Frontend application if the VirtualBox host-only network and NodePort access are working.

You can also test another cluster node:

```
http://192.168.56.11:30080
```

NodePort is normally exposed through the cluster nodes, provided the node's networking and firewall permit access.

## 13. Deploy Frontend in Test

Install the same Helm chart using the Test values file.

Run:

```
cd ~/Micro_App_Doc/helm/frontend
```

Install:

```
helm upgrade --install frontend . \
  --namespace micro-app-test \
  -f values-test.yaml
```

### 13.1 Verify Helm release

```
helm list -n micro-app-test

helm status frontend -n micro-app-test
```

### 13.2 Verify Deployment and Service

```
kubectl get deployments,pods,services -n micro-app-test
```

### 13.3 Check rollout

```
kubectl rollout status deployment/frontend \
  -n micro-app-test --timeout=180s
```

### 13.4 Check logs

```
kubectl logs deployment/frontend \
  -n micro-app-test --tail=100
```

### 13.5 Verify NodePort

```
kubectl get service frontend \
  -n micro-app-test -o wide
```

Expected:

```
TYPE       PORT(S)
NodePort   80:30081/TCP
```

### 13.6 Access Test Frontend

Open:

```
http://192.168.56.10:30081
```

This should open the Test Frontend application when network access is configured correctly.

## 14. Deploy Frontend in QA

Deploy the same Helm chart in QA.

Run:

```
cd ~/Micro_App_Doc/helm/frontend
```

Install:

```
helm upgrade --install frontend . \
  --namespace micro-app-qa \
  -f values-qa.yaml
```

### 14.1 Verify Helm release

```
helm list -n micro-app-qa

helm status frontend -n micro-app-qa
```

### 14.2 Verify Deployment and Service

```
kubectl get deployments,pods,services -n micro-app-qa
```

### 14.3 Check rollout

```
kubectl rollout status deployment/frontend \
  -n micro-app-qa --timeout=180s
```

### 14.4 Check application logs

```
kubectl logs deployment/frontend \
  -n micro-app-qa --tail=100
```

### 14.5 Verify NodePort

```
kubectl get service frontend \
  -n micro-app-qa -o wide
```

Expected:

```
TYPE       PORT(S)
NodePort   80:30082/TCP
```

### 14.6 Access QA Frontend

Open:

```
http://192.168.56.10:30082
```

The QA URL should display the Frontend application when the QA Pod and networking are healthy.

## 15. Frontend and Backend API Integration

Deploying the Frontend independently does not automatically configure communication with the Auth, User and Item microservices.

Our existing Frontend Deployment does not define API-related environment variables.

If the Frontend is a static application such as React, API URLs may already be embedded in the JavaScript bundle during the Docker image build.

For example, the browser may use API URLs such as:

```
/api/auth
/api/users
/api/items
```

These paths require an appropriate Ingress or reverse-proxy configuration to route requests to the correct backend Services.

Important distinction:

Kubernetes internal Service DNS names such as:

```
auth-service:8080
user-service:8081
item-service:8082
```

are available to Pods inside the cluster. A browser running on the Windows host cannot normally resolve these Kubernetes-only DNS names.

Before declaring the complete Frontend migration successful, verify:

1. Which API URLs are embedded in the Frontend image.
2. Whether the Frontend expects relative API paths.
3. Whether an Nginx reverse proxy or Ingress is already configured.
4. Whether API requests reach the correct backend services in each namespace.

We should inspect the Frontend Docker image or its source configuration before modifying API endpoints.

## 16. Final Verification Across All Environments

### 16.1 Check Helm releases

```
helm list -n micro-app-dev

helm list -n micro-app-test

helm list -n micro-app-qa
```

Each namespace should contain:

```
external-postgres
auth-service
user-service
item-service
frontend
```

### 16.2 Check Frontend Deployments

```
kubectl get deployments -A | grep frontend
```

Expected:

```
micro-app-dev    frontend    1/1
micro-app-test   frontend    1/1
micro-app-qa     frontend    1/1
```

### 16.3 Check Pods

```
kubectl get pods -n micro-app-dev

kubectl get pods -n micro-app-test

kubectl get pods -n micro-app-qa
```

All Frontend Pods should show:

```
READY   STATUS
1/1     Running
```

### 16.4 Check Services

```
kubectl get services -A | grep frontend
```

Expected:

| Namespace      | Service type | Port     |
| -------------- | ------------ | -------- |
| micro-app-dev  | NodePort     | 80:30080 |
| micro-app-test | NodePort     | 80:30081 |
| micro-app-qa   | NodePort     | 80:30082 |

### 16.5 Check EndpointSlices

```
kubectl get endpointslice \
  -n micro-app-dev \
  -l kubernetes.io/service-name=frontend

kubectl get endpointslice \
  -n micro-app-test \
  -l kubernetes.io/service-name=frontend

kubectl get endpointslice \
  -n micro-app-qa \
  -l kubernetes.io/service-name=frontend
```

Each environment should have a ready Frontend Pod endpoint on port 80.

## 17. Helm Upgrade and Rollback

Helm allows us to upgrade the Frontend independently in each environment.

### 17.1 Upgrade Frontend in Dev

For example, when a new Docker image version becomes available:

```
helm upgrade frontend . \
  --namespace micro-app-dev \
  -f values-dev.yaml \
  --set image.tag=1.1.0
```

For repeatable deployments, update the image tag in the values file and commit the change to source control.

### 17.2 Check release history

```
helm history frontend -n micro-app-dev
```

### 17.3 Roll back to a previous revision

```
helm rollback frontend 1 \
  --namespace micro-app-dev
```

Replace `1` with the revision you want to restore.

Test and QA can also be upgraded or rolled back independently.

## 18. Troubleshooting

### 18.1 NodePort already allocated

If Kubernetes reports:

```
provided port is already allocated
```

Check existing NodePorts:

```
kubectl get services -A
```

Select another unused port within the configured NodePort range and update the corresponding environment values file.

### 18.2 Pod shows ImagePullBackOff

```
kubectl describe pods -n micro-app-dev \
  -l app.kubernetes.io/name=frontend
```

Check the image name, image tag, registry availability and pull authentication.

### 18.3 Pod shows CrashLoopBackOff

```
kubectl logs deployment/frontend \
  -n micro-app-dev --tail=100
```

If the container has restarted:

```
kubectl logs deployment/frontend \
  -n micro-app-dev --previous --tail=100
```

### 18.4 Service Has No Endpoints

```
kubectl get pods -n micro-app-dev

kubectl describe service frontend \
  -n micro-app-dev

kubectl get endpointslice \
  -n micro-app-dev \
  -l kubernetes.io/service-name=frontend
```

Verify that the Pod is Ready and that its labels match the Service selector.

### 18.5 Frontend Not Accessible from Windows

Check the Service:

```
kubectl get service frontend \
  -n micro-app-dev -o wide
```

Check the Pod:

```
kubectl get pods -n micro-app-dev -o wide
```

Check connectivity from Windows:

```
Test-NetConnection 192.168.56.10 -Port 30080
```

If connectivity fails, inspect the VirtualBox host-only network, node firewall and Kubernetes NodePort configuration.

### 18.6 Frontend Loads but Backend APIs Fail

Check the browser's Developer Tools:

- Open the Network tab.
- Reload the Frontend.
- Inspect failed API requests.
- Identify the actual API URL used by the browser.
- Check whether the URL is accessible from the Windows host.
- Verify the required Ingress or reverse-proxy routes.

Do not assume that backend Kubernetes DNS names can be accessed directly by the browser.

## 19. Important Implementation Notes

1. We use one reusable Frontend Helm chart across Dev, Test and QA.
2. Each environment has an independent Helm release.
3. Each environment runs inside its own Kubernetes namespace.
4. We preserve the original Frontend Docker image and container port.
5. CPU and memory requests and limits are preserved.
6. Startup, readiness and liveness probes are preserved.
7. We use NodePort instead of LoadBalancer for the VirtualBox lab.
8. Each environment uses a different NodePort.
9. NodePorts are allocated cluster-wide, so they must not conflict with other Services.
10. The namespace is specified during Helm installation instead of hardcoded in templates.
11. The existing Frontend Deployment and Service in `micro-app` should be preserved until the new environment deployments are verified.
12. Frontend-to-backend API communication must be verified separately from Frontend Pod health.
13. The NodePort configuration provides network access to the Frontend; it does not automatically provide API routing or environment-specific application configuration.

## 20. Final Project Directory Structure

After creating all four application Helm charts, our project structure will look like this:

```
Micro_App_Doc/
│
└── helm/
    │
    ├── external-postgres/
    │   ├── Chart.yaml
    │   ├── values.yaml
    │   ├── values-dev.yaml
    │   ├── values-test.yaml
    │   ├── values-qa.yaml
    │   └── templates/
    │       ├── NOTES.txt
    │       ├── _helpers.tpl
    │       ├── auth-configmap.yaml
    │       ├── user-configmap.yaml
    │       └── item-configmap.yaml
    │
    ├── auth-service/
    │   ├── Chart.yaml
    │   ├── values.yaml
    │   ├── values-dev.yaml
    │   ├── values-test.yaml
    │   ├── values-qa.yaml
    │   └── templates/
    │       ├── _helpers.tpl
    │       ├── deployment.yaml
    │       └── service.yaml
    │
    ├── user-service/
    │   ├── Chart.yaml
    │   ├── values.yaml
    │   ├── values-dev.yaml
    │   ├── values-test.yaml
    │   ├── values-qa.yaml
    │   └── templates/
    │       ├── _helpers.tpl
    │       ├── deployment.yaml
    │       └── service.yaml
    │
    ├── item-service/
    │   ├── Chart.yaml
    │   ├── values.yaml
    │   ├── values-dev.yaml
    │   ├── values-test.yaml
    │   ├── values-qa.yaml
    │   └── templates/
    │       ├── _helpers.tpl
    │       ├── deployment.yaml
    │       └── service.yaml
    │
    └── frontend/
        ├── Chart.yaml
        ├── values.yaml
        ├── values-dev.yaml
        ├── values-test.yaml
        ├── values-qa.yaml
        └── templates/
            ├── _helpers.tpl
            ├── deployment.yaml
            └── service.yaml
```

## 21. Implementation Status

Based on the Frontend chart validation and the previously shared project configuration:

| Component               | Dev                  | Test                 | QA                   |
| ----------------------- | -------------------- | -------------------- | -------------------- |
| Helm chart validation   | Passed               | Passed               | Passed               |
| Template rendering      | Passed               | Passed               | Passed               |
| Deployment              | Pending installation | Pending installation | Pending installation |
| Pod                     | Pending verification | Pending verification | Pending verification |
| NodePort                | 30080                | 30081                | 30082                |
| Browser access          | Pending              | Pending              | Pending              |
| Backend API integration | To be verified       | To be verified       | To be verified       |

The Frontend chart has been validated successfully, but the actual Dev, Test and QA deployments and browser access still need to be completed.

## 22. Conclusion

We have created a reusable Helm chart design for the Frontend application.

The same Helm chart can be installed in Dev, Test and QA using different values files.

We preserve the existing Docker image, container port, health checks and resource configuration while changing the external access mechanism from LoadBalancer to NodePort.

This implementation provides:

- Independent Frontend deployment.
- Environment-specific NodePort assignments.
- Consistent deployment configuration.
- Independent Helm upgrades and rollbacks.
- Easier management of multiple Frontend environments.
- A foundation for future Ingress and SSL integration.

**Next implementation:** Complete Frontend deployment in all three namespaces, verify browser access and backend API integration, and then perform end-to-end validation of the complete microservices application.

**End of Article**

**Implementation status:** Your Frontend Helm chart has passed `helm lint` and Dev, Test and QA template rendering. The NodePort availability check and actual installations are still pending.
