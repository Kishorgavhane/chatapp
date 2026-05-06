# GitOps Platform on AWS EKS — Architecture Documentation

**Project:** Kubernetes GitOps CI/CD Platform  
**Repository:** https://github.com/Kishorgavhane/chatapp  
**Region:** ap-south-1 (Mumbai)  
**Author:** Kishor Gavhane

---

## Overview

This project implements a production-grade, end-to-end DevOps pipeline on AWS. The platform automates everything from a developer's git push to a live deployment on Kubernetes — with security scanning, GitOps-based delivery, and full observability baked in.

The stack brings together Terraform for infrastructure, GitHub Actions for CI, Jenkins for CD orchestration, ArgoCD for GitOps delivery, and Prometheus + Grafana for monitoring — all running on AWS EKS.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          DEVELOPER WORKSTATION (Pune)                           │
│                     git push → GitHub (Kishorgavhane/chatapp)                   │
└──────────────────────────────────┬──────────────────────────────────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │       GitHub Actions CI       │
                    │  .github/workflows/ci.yml     │
                    │                               │
                    │  1. Code Checkout             │
                    │  2. Run Tests                 │
                    │  3. Docker Build              │
                    │     - chatapp-backend         │
                    │     - chatapp-frontend        │
                    │  4. Trivy Security Scan       │
                    │  5. Push to Amazon ECR        │
                    └──────────────┬───────────────┘
                                   │
              ┌────────────────────▼────────────────────┐
              │          Amazon ECR (ap-south-1)         │
              │   Repos: chatapp-backend                 │
              │           chatapp-frontend               │
              └────────────────────┬────────────────────┘
                                   │ Webhook Trigger
                    ┌──────────────▼──────────────┐
                    │       Jenkins CD Server       │
                    │   EC2 t2.medium (Ubuntu 24)   │
                    │   Jenkins 2.555.1 (Java 21)   │
                    │                               │
                    │  Pipeline: chatapp-cd         │
                    │  ┌─────────────────────────┐  │
                    │  │ Stage 1: Checkout SCM    │  │
                    │  │ Stage 2: Configure AWS   │  │
                    │  │          + kubectl       │  │
                    │  │ Stage 3: ECR Login       │  │
                    │  │ Stage 4: Deploy          │  │
                    │  │ Stage 5: Prod Approval   │  │
                    │  │         (Manual Gate)    │  │
                    │  └─────────────────────────┘  │
                    └──────────────┬────────────────┘
                                   │
          ┌────────────────────────▼───────────────────────┐
          │              AWS EKS Cluster                    │
          │         Name: chatapp-cluster                   │
          │         Version: Kubernetes 1.32                │
          │         Nodes: 2 × t3.small                     │
          │                                                 │
          │  ┌──────────────────────────────────────────┐  │
          │  │  Namespace: argocd                       │  │
          │  │  ArgoCD v3.1.9                           │  │
          │  │  App: chatapp → helm/app-chart           │  │
          │  │  Sync: Automatic (watches GitHub repo)   │  │
          │  │  Status: Healthy ✅                      │  │
          │  └──────────────────────────────────────────┘  │
          │                                                 │
          │  ┌──────────────────────────────────────────┐  │
          │  │  Namespace: prod                         │  │
          │  │  Deployments:                            │  │
          │  │    - chatapp-backend  (Python / Flask)   │  │
          │  │    - chatapp-frontend (React + Nginx)    │  │
          │  │  Services:                               │  │
          │  │    - chatapp-frontend-svc (LoadBalancer) │  │
          │  │    - backend (ClusterIP → port 8000)     │  │
          │  └──────────────────────────────────────────┘  │
          │                                                 │
          │  ┌──────────────────────────────────────────┐  │
          │  │  Namespace: monitoring                   │  │
          │  │  kube-prometheus-stack                   │  │
          │  │    - Prometheus 3.11.3                   │  │
          │  │    - Grafana (LoadBalancer exposed)      │  │
          │  │    - Node Exporter (per node)            │  │
          │  │    - Alertmanager                        │  │
          │  └──────────────────────────────────────────┘  │
          └────────────────────────┬───────────────────────┘
                                   │
          ┌────────────────────────▼───────────────────────┐
          │            AWS Network Layer (Terraform)        │
          │  VPC: 10.0.0.0/16                              │
          │  Public Subnets:  10.0.1.0/24, 10.0.2.0/24    │
          │  Private Subnets: 10.0.3.0/24, 10.0.4.0/24    │
          │  AZs: ap-south-1a, ap-south-1b                 │
          │  Internet Gateway + NAT Gateway                 │
          └────────────────────────────────────────────────┘
```

---

## Component Breakdown

### Infrastructure Layer (Terraform)

All AWS infrastructure is provisioned using Terraform with a modular structure. The code lives in `terraform/modules/` with separate modules for VPC and EKS, and environment-specific configurations under `terraform/envs/dev/`.

**What Terraform provisions:**

| Resource | Details |
|---|---|
| VPC | 10.0.0.0/16 CIDR, ap-south-1 |
| Public Subnets | 2 subnets across ap-south-1a and ap-south-1b |
| Private Subnets | 2 subnets for EKS worker nodes |
| Internet Gateway | For public subnet internet access |
| NAT Gateway | For private subnet outbound traffic |
| EKS Cluster | chatapp-cluster, Kubernetes v1.32 |
| Node Group | chatapp-cluster-nodes, t3.small, min 1 / max 3 |
| IAM Roles | Cluster role + Node role with required policies |
| Security Groups | Jenkins SG (22, 8080) + EKS cluster SG |
| Jenkins EC2 | t2.medium, Ubuntu 24.04, 20GB EBS |

---

### CI Pipeline (GitHub Actions)

The CI pipeline triggers on every push to the `main` branch. It handles building, scanning, and pushing Docker images to ECR.

**Pipeline file:** `.github/workflows/ci.yml`

**Stages:**
1. Code checkout from GitHub
2. AWS credentials configuration
3. ECR login using `aws ecr get-login-password`
4. Docker build — backend (Python 3.12-slim) and frontend (Node 20 + Nginx)
5. Trivy security scan on built images
6. Image push to ECR with `latest` tag
7. Post-deploy notification via `notify.yml`

---

### CD Pipeline (Jenkins)

Jenkins runs on a dedicated EC2 instance and handles deployment orchestration. The pipeline is defined in `jenkins/Jenkinsfile` and triggered manually or via webhook.

**Jenkins Details:**

| Property | Value |
|---|---|
| Version | 2.555.1 |
| Runtime | WAR file (Java 21) |
| Instance | EC2 t2.medium |
| Pipeline Job | chatapp-cd |
| Total Builds | 12 (as of completion) |

**Pipeline Stages:**

| Stage | What it does |
|---|---|
| Checkout SCM | Pulls latest code from GitHub using github-token credential |
| Configure AWS + kubectl | Runs `aws eks update-kubeconfig` for chatapp-cluster |
| ECR Login | Authenticates Docker with ECR using aws-credentials |
| Deploy | Creates namespace if absent, deploys to target environment |
| Production Approval | Manual gate — operator must click Deploy in Blue Ocean UI |
| Post Actions | Workspace cleanup via `cleanWs()` |

---

### GitOps Layer (ArgoCD)

ArgoCD runs inside the EKS cluster in the `argocd` namespace and watches the GitHub repository for changes to the Helm chart. Any merge to main triggers an automatic sync to the cluster.

**ArgoCD Details:**

| Property | Value |
|---|---|
| Version | 3.1.9 |
| App Name | chatapp |
| Source Repo | https://github.com/Kishorgavhane/chatapp |
| Chart Path | helm/app-chart |
| Destination | in-cluster, namespace: prod |
| Sync Policy | Automatic |
| Health Status | Healthy |

**GitOps Flow:**
```
Developer: git push
         → GitHub repo updated
         → ArgoCD detects diff (within ~3 min polling)
         → ArgoCD runs helm upgrade on cluster
         → Kubernetes reconciles pods
         → App live without any manual kubectl
```

---

### Application Layer

The ChatApp is a full-stack real-time chat application with sign in / sign up functionality.

**Backend:** Python (Flask), runs on port 8000 inside the container. Connects to a database for user sessions and messages.

**Frontend:** React application built with Vite, served via Nginx. The Nginx config reverse-proxies `/api` calls to the backend ClusterIP service named `backend`.

**ECR Repositories:**
- `182138815046.dkr.ecr.ap-south-1.amazonaws.com/chatapp-backend`
- `182138815046.dkr.ecr.ap-south-1.amazonaws.com/chatapp-frontend`

**Kubernetes Services in prod namespace:**

| Service Name | Type | Port | Target |
|---|---|---|---|
| chatapp-frontend-svc | LoadBalancer | 80 | Frontend pod port 80 |
| backend | ClusterIP | 80 | Backend pod port 8000 |
| chatapp-backend-svc | ClusterIP | 8000 | Backend pod port 8000 |

---

### Observability Stack (Prometheus + Grafana)

The full Prometheus stack is deployed via Helm into the `monitoring` namespace.

**Helm release:** `prometheus-community/kube-prometheus-stack`

| Component | Details |
|---|---|
| Prometheus | v3.11.3, scraping ~400 targets across the cluster |
| Grafana | Exposed via AWS LoadBalancer on port 80 |
| Node Exporter | Per-node system metrics (CPU, RAM, Disk, Network I/O) |
| Alertmanager | Alert routing and grouping |
| kube-state-metrics | Kubernetes object-level metrics |

**Grafana Dashboards used:**
- Node Exporter Full — CPU busy 4.2–4.3%, RAM 75–78%, Disk I/O, Network traffic
- Prometheus Overview — Query rate, scrape intervals, head series count
- Alertmanager Overview
- Kubernetes Cluster Dashboard

---

## Repository Structure

```
chatapp/
├── terraform/
│   ├── modules/
│   │   ├── vpc/
│   │   │   ├── main.tf          # VPC, subnets, IGW, NAT, route tables
│   │   │   ├── variables.tf
│   │   │   └── outputs.tf       # vpc_id, public_subnet_ids, private_subnet_ids
│   │   └── eks/
│   │       ├── main.tf          # EKS cluster, node group, IAM roles + policies
│   │       ├── variables.tf
│   │       └── outputs.tf
│   └── envs/
│       └── dev/
│           ├── main.tf          # VPC + EKS module calls
│           ├── provider.tf      # AWS provider, ap-south-1
│           └── jenkins.tf       # Jenkins EC2 + jenkins-sg resource
│
├── app/
│   └── chatapp/
│       ├── backend/
│       │   ├── app/             # Flask application code
│       │   ├── Dockerfile       # python:3.12-slim base, multi-stage
│       │   └── requirements.txt
│       └── frontend/
│           ├── src/             # React components
│           ├── Dockerfile       # node:20-alpine build + nginx:1.25-alpine serve
│           ├── nginx.conf       # Proxy /api → backend service
│           └── package.json
│
├── helm/
│   └── app-chart/
│       ├── Chart.yaml           # Chart name: chatapp, version: 0.1.0
│       ├── values.yaml          # ECR image repos + service types
│       └── templates/
│           ├── deployment.yaml  # Backend + Frontend deployments
│           └── service.yaml     # ClusterIP (backend) + LoadBalancer (frontend)
│
├── jenkins/
│   └── Jenkinsfile              # Pipeline with 5 stages + post section
│
├── .github/
│   └── workflows/
│       ├── ci.yml               # Build, Trivy scan, ECR push
│       └── notify.yml           # Post-deploy notification workflow
│
└── scripts/
    ├── health-check.sh
    ├── cleanup-images.sh
    └── etcd-backup.sh
```

---

## Network and Security Architecture

```
Internet
   │
   ▼
AWS Application Load Balancer (auto-created by EKS for LoadBalancer services)
   │
   ├── Port 80  → chatapp-frontend-svc (prod namespace)
   ├── Port 80  → Grafana service (monitoring namespace)
   └── Port 443 → ArgoCD server (argocd namespace)
   
Jenkins EC2 (Public Subnet, sg: jenkins-sg)
   Inbound: 22 (SSH), 8080 (Jenkins UI)
   
VPC: 10.0.0.0/16
   ├── Public Subnets → Jenkins EC2, NAT Gateway EIP
   └── Private Subnets → EKS Worker Nodes (t3.small × 2)
         └── All application pods scheduled here

EKS Cluster SG (eks-cluster-sg-chatapp-cluster):
   Inbound: 80, 32252, 30105, 8080 from 0.0.0.0/0
```

---

## Technology Stack Summary

| Category | Technology | Version |
|---|---|---|
| Cloud Provider | AWS | ap-south-1 |
| Container Orchestration | Kubernetes EKS | 1.32 |
| Infrastructure as Code | Terraform | Latest |
| CI Pipeline | GitHub Actions | — |
| CD Orchestrator | Jenkins | 2.555.1 |
| GitOps Controller | ArgoCD | 3.1.9 |
| K8s Package Manager | Helm | Latest |
| Metrics | Prometheus | 3.11.3 |
| Dashboards | Grafana | Latest |
| Container Registry | Amazon ECR | — |
| Backend Language | Python / Flask | 3.12 |
| Frontend Framework | React + Vite | Node 20 |
| Web Server (frontend) | Nginx | 1.25-alpine |
| Jenkins OS | Ubuntu | 24.04 |
| Jenkins Runtime | OpenJDK | 21 |
| Node OS | Amazon Linux (EKS) | — |

---

## Live Access URLs (at time of project completion)

| Service | URL |
|---|---|
| ChatApp Frontend | `http://af8eca45ba3434689a360293cbf16b15-1102945746.ap-south-1.elb.amazonaws.com` |
| Grafana Dashboard | `http://a858ea937fbc3454c8215c2ae683c49b-349729100.ap-south-1.elb.amazonaws.com` |
| ArgoCD UI | `https://a45e188a2cb13401ca8cf6ee1f72928b-1222293182.ap-south-1.elb.amazonaws.com` |
| Jenkins | `http://35.154.237.87:8080` |