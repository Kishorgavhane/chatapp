cat > README.md << 'EOF'
# Enterprise GitOps DevOps Platform

End-to-end DevOps pipeline on AWS EKS using:
- **Terraform** — Infrastructure as Code (VPC, EKS, IAM)
- **Ansible** — Node configuration & hardening
- **Docker** — Application containerization
- **GitHub Actions** — CI Pipeline (build, test, scan, push)
- **Jenkins** — CD Orchestrator (env promotion)
- **ArgoCD** — GitOps continuous delivery
- **Kubernetes** — Container orchestration (EKS)
- **Helm** — Kubernetes package management
- **Prometheus + Grafana** — Observability

## Architecture
Developer Push → GitHub Actions CI → ECR Push → Jenkins CD → ArgoCD GitOps → EKS

## Repo Structure
- `terraform/` — AWS infrastructure modules
- `ansible/` — Server configuration playbooks
- `app/` — Sample Node.js application
- `.github/workflows/` — CI pipelines
- `jenkins/` — Jenkinsfile for CD
- `scripts/` — Automation bash scripts
- `helm/` — Helm chart for app deployment
EOF
# CI Test
