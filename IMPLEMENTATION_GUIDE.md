# GitOps Platform on AWS EKS — Implementation Guide

**Project:** Kubernetes GitOps CI/CD Platform  
**Repository:** https://github.com/Kishorgavhane/chatapp  
**Author:** Kishor Gavhane  
**Environment:** Ubuntu 24.04, AWS ap-south-1

---

## Prerequisites

Before starting, make sure you have the following ready on your local machine.

- Ubuntu 20.04 / 22.04 / 24.04
- AWS account with billing enabled (Free Tier alone is not sufficient — t2.medium and t3.small instances are required)
- IAM user with AdministratorAccess or appropriate scoped permissions
- GitHub account with a repository ready
- Minimum 8 GB RAM on local machine for Docker builds

---

## Phase 1 — Local Tooling Setup

Install all required tools on your local Ubuntu machine before touching any cloud resource.

### 1.1 System Check

```bash
uname -a
lsb_release -a
```

### 1.2 Git Configuration

```bash
sudo apt update && sudo apt install git -y
git config --global user.name "Your Name"
git config --global user.email "your@email.com"
git --version
```

### 1.3 AWS CLI v2

```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
sudo apt install unzip -y
unzip -o awscliv2.zip
sudo ./aws/install --update
aws --version
```

Configure it with your IAM credentials:

```bash
aws configure
# AWS Access Key ID     → from IAM console
# AWS Secret Access Key → from IAM console
# Default region        → ap-south-1
# Default output format → json
```

### 1.4 kubectl

```bash
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
kubectl version --client
```

### 1.5 Terraform

```bash
wget -O - https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install terraform -y
terraform -version
```

### 1.6 Helm

```bash
curl https://baltocdn.com/helm/signing.asc | gpg --dearmor | sudo tee /usr/share/keyrings/helm.gpg > /dev/null
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/helm.gpg] https://baltocdn.com/helm/stable/debian/ all main" | sudo tee /etc/apt/sources.list.d/helm-stable-debian.list
sudo apt update && sudo apt install helm -y
helm version
```

### 1.7 Docker

```bash
sudo apt install ca-certificates curl gnupg -y
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update && sudo apt install docker-ce docker-ce-cli containerd.io -y
sudo usermod -aG docker $USER
newgrp docker
docker --version
```

---

## Phase 2 — Repository Setup

Clone your repository and set up the folder structure locally.

```bash
mkdir -p ~/Documents/AWSProject
cd ~/Documents/AWSProject
git clone https://github.com/Kishorgavhane/chatapp.git
cd chatapp
```

The repository already contains all the required structure including `terraform/`, `app/`, `helm/`, `jenkins/`, and `.github/workflows/`.

---

## Phase 3 — AWS Infrastructure with Terraform

This phase provisions the VPC, EKS cluster, IAM roles, node group, and Jenkins EC2 all in one apply.

### 3.1 Navigate to the dev environment

```bash
cd ~/Documents/AWSProject/chatapp/terraform/envs/dev
```

### 3.2 Initialize Terraform

```bash
terraform init
```

### 3.3 Review the plan

```bash
terraform plan
```

You should see 22–24 resources planned including VPC, subnets, IGW, NAT gateway, EKS cluster, node group, IAM roles, and the Jenkins EC2 instance.

### 3.4 Apply the infrastructure

```bash
terraform apply
```

Type `yes` when prompted. This takes approximately 15–20 minutes due to the EKS cluster provisioning time.

Upon completion you will see:

```
Apply complete! Resources: 22 added, 0 changed, 0 destroyed.

Outputs:
jenkins_public_ip = "X.X.X.X"
```

### 3.5 Configure kubectl for EKS

```bash
aws eks update-kubeconfig \
  --region ap-south-1 \
  --name chatapp-cluster

kubectl get nodes
```

Expected output:

```
NAME                                       STATUS   ROLES    AGE   VERSION
ip-10-0-4-xxx.ap-south-1.compute.internal  Ready    <none>   2m    v1.32.13-eks-40737a8
```

---

## Phase 4 — Docker Images Build and ECR Push

### 4.1 ECR Login

```bash
aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS \
  --password-stdin 182138815046.dkr.ecr.ap-south-1.amazonaws.com
```

Output: `Login Succeeded`

### 4.2 Create ECR Repositories (if not already existing)

```bash
aws ecr create-repository --repository-name chatapp-backend --region ap-south-1
aws ecr create-repository --repository-name chatapp-frontend --region ap-south-1
```

If they already exist, you'll get `RepositoryAlreadyExistsException` — that is fine, continue.

### 4.3 Build and Push Backend

```bash
cd ~/Documents/AWSProject/chatapp/app/chatapp/backend

docker build -t chatapp-backend:latest .

docker tag chatapp-backend:latest \
  182138815046.dkr.ecr.ap-south-1.amazonaws.com/chatapp-backend:latest

docker push 182138815046.dkr.ecr.ap-south-1.amazonaws.com/chatapp-backend:latest
```

### 4.4 Build and Push Frontend

```bash
cd ~/Documents/AWSProject/chatapp/app/chatapp/frontend

docker build -t chatapp-frontend:latest .

docker tag chatapp-frontend:latest \
  182138815046.dkr.ecr.ap-south-1.amazonaws.com/chatapp-frontend:latest

docker push 182138815046.dkr.ecr.ap-south-1.amazonaws.com/chatapp-frontend:latest
```

### 4.5 Verify ECR

```bash
aws ecr list-images --repository-name chatapp-backend --region ap-south-1
aws ecr list-images --repository-name chatapp-frontend --region ap-south-1
```

---

## Phase 5 — Jenkins Setup on EC2

SSH into the Jenkins EC2 that was created by Terraform.

### 5.1 SSH into Jenkins Server

```bash
ssh -i ~/.ssh/gitops-key.pem ubuntu@<JENKINS_PUBLIC_IP>
```

If you get `Permission denied`, check the key file permissions:

```bash
chmod 400 ~/.ssh/gitops-key.pem
```

### 5.2 Wait for unattended-upgrades to finish

On a freshly launched EC2, Ubuntu runs background updates automatically. If you try to install packages immediately, you will get a lock error. Wait for it or force-stop it:

```bash
sudo systemctl stop unattended-upgrades
sudo rm -f /var/lib/apt/lists/lock
sudo rm -f /var/lib/dpkg/lock
sudo rm -f /var/lib/dpkg/lock-frontend
sudo rm -f /var/cache/apt/archives/lock
```

### 5.3 Install Java 21

Jenkins 2.555.x requires Java 21 minimum. Java 17 will not work.

```bash
sudo apt update
sudo apt install -y openjdk-21-jdk
sudo update-alternatives --set java /usr/lib/jvm/java-21-openjdk-amd64/bin/java
java -version
```

Expected: `openjdk version "21.x.x"`

### 5.4 Download Jenkins WAR

The Jenkins apt repository's GPG key expires periodically. The reliable alternative is to run Jenkins directly from the official WAR file.

```bash
wget https://get.jenkins.io/war-stable/latest/jenkins.war
```

### 5.5 Start Jenkins in Background

```bash
nohup java -jar ~/jenkins.war --httpPort=8080 > ~/jenkins.log 2>&1 &

# Wait for startup
sleep 15

# Confirm it's running
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:8080
```

You should see `HTTP Status: 403` which means Jenkins is up and waiting for authentication.

### 5.6 Get Initial Admin Password

```bash
cat ~/.jenkins/secrets/initialAdminPassword
```

Copy this password — you need it for the first login.

### 5.7 Jenkins Browser Setup

Open `http://<JENKINS_IP>:8080` in your browser.

1. Paste the initial admin password
2. Click **Install Suggested Plugins** — wait 2–3 minutes
3. Create your admin user with a strong password
4. Confirm the Jenkins URL and click **Save and Finish**
5. Click **Start using Jenkins**

### 5.8 Install Required Plugins

Go to **Manage Jenkins → Plugins → Available plugins** and install:

- GitHub Integration
- Pipeline
- Docker Pipeline
- AWS Credentials
- Kubernetes CLI
- Blue Ocean

Click **Install and restart**.

### 5.9 Install Tools on Jenkins EC2

Still on the Jenkins EC2 via SSH, install AWS CLI and kubectl:

```bash
# AWS CLI v2
cd ~ && curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip -o awscliv2.zip
sudo ./aws/install --update
aws --version

# kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
kubectl version --client

# Configure AWS on Jenkins server
aws configure set region ap-south-1
aws configure set output json
# Then run: aws configure  (enter your access key and secret)

# Connect kubectl to EKS
aws eks update-kubeconfig --region ap-south-1 --name chatapp-cluster
kubectl get nodes
```

### 5.10 Add Jenkins Credentials

Go to **Manage Jenkins → Credentials → System → Global Credentials → Add Credentials**.

Add the following three credentials:

**Credential 1 — AWS Keys:**
```
Kind:       AWS Credentials
ID:         aws-credentials
Access Key: <your AWS access key>
Secret Key: <your AWS secret key>
```

**Credential 2 — GitHub Token:**
```
Kind:     Username with password
ID:       github-token
Username: Kishorgavhane
Password: <your GitHub Personal Access Token>
```

To create a GitHub PAT: github.com → Settings → Developer Settings → Personal Access Tokens → Tokens (classic) → Generate new token → select `repo` and `workflow` scopes.

**Credential 3 — Kubeconfig:**

First generate the file on your local machine:

```bash
aws eks update-kubeconfig \
  --region ap-south-1 \
  --name chatapp-cluster \
  --kubeconfig ~/.kube/gitops-config
```

Then in Jenkins:
```
Kind:        Secret file
ID:          kubeconfig
File:        upload ~/.kube/gitops-config
```

### 5.11 Create Jenkins Pipeline Job

1. Click **New Item**
2. Name: `chatapp-cd`, Type: **Pipeline**, click OK
3. Under **Build Triggers**: tick **GitHub hook trigger for GITScm polling**
4. Under **Pipeline**:
   - Definition: Pipeline script from SCM
   - SCM: Git
   - Repository URL: `https://github.com/Kishorgavhane/chatapp.git`
   - Credentials: github-token
   - Branch: `*/main`
   - Script Path: `jenkins/Jenkinsfile`
5. Click **Save**

### 5.12 Run the Pipeline

Click **Build with Parameters**, set `TARGET_ENV` to `dev` and `IMAGE_TAG` to `latest`, then click **Build**.

Watch it in Blue Ocean. When it reaches the **Production Approval** stage (only when TARGET_ENV is `prod`), click **Deploy** to approve.

---

## Phase 6 — ArgoCD Setup on EKS

All commands run from your local machine where kubectl is configured for chatapp-cluster.

### 6.1 Create Namespace and Install ArgoCD

```bash
kubectl create namespace argocd

kubectl apply -n argocd -f \
  https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

### 6.2 Wait for Pods to be Ready

```bash
kubectl get pods -n argocd -w
```

Wait until all pods show `1/1 Running`. This typically takes 2–3 minutes.

### 6.3 Expose ArgoCD UI via LoadBalancer

```bash
kubectl patch svc argocd-server \
  -n argocd \
  -p '{"spec": {"type": "LoadBalancer"}}'

kubectl get svc argocd-server -n argocd -w
```

Wait for `EXTERNAL-IP` to appear — it will be an AWS ELB hostname.

### 6.4 Get ArgoCD Admin Password

```bash
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d
echo ""
```

### 6.5 Log in to ArgoCD UI

Open the external IP in browser. You will see a TLS warning — click **Advanced → Proceed**.

Login with:
- Username: `admin`
- Password: from previous step

### 6.6 Create ArgoCD Application

Click **+ New App** and fill in:

```
Application Name: chatapp
Project:          default
Sync Policy:      Automatic
Repo URL:         https://github.com/Kishorgavhane/chatapp.git
Revision:         HEAD
Path:             helm/app-chart
Cluster:          https://kubernetes.default.svc
Namespace:        prod
```

Click **Create**. ArgoCD will sync the Helm chart and deploy the application.

---

## Phase 7 — Prometheus and Grafana Setup

### 7.1 Add Helm Repository

```bash
helm repo add prometheus-community \
  https://prometheus-community.github.io/helm-charts
helm repo update
```

### 7.2 Install kube-prometheus-stack

```bash
helm install prometheus \
  prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set grafana.adminPassword=admin123
```

### 7.3 Expose Grafana via LoadBalancer

```bash
kubectl patch svc prometheus-grafana \
  -n monitoring \
  -p '{"spec": {"type": "LoadBalancer"}}'

kubectl get svc prometheus-grafana -n monitoring
```

### 7.4 Access Grafana

Open the external IP in browser.

Login with:
- Username: `admin`
- Password: `admin123`

### 7.5 Import Dashboards

Go to **Dashboards → Import** and import:
- Dashboard ID `1860` — Node Exporter Full
- Dashboard ID `15661` — Kubernetes Cluster

---

## Phase 8 — Expose the Application

After ArgoCD deploys the app, you need to expose the frontend service externally.

### 8.1 Check Current Services

```bash
kubectl get svc -n prod
```

If `chatapp-frontend-svc` is still ClusterIP, patch it:

```bash
kubectl patch svc chatapp-frontend-svc \
  -n prod \
  -p '{"spec": {"type": "LoadBalancer"}}'
```

### 8.2 Wait for External IP

```bash
kubectl get svc chatapp-frontend-svc -n prod -w
```

### 8.3 Fix the Backend Service Name

The Nginx config in the frontend container references a service named `backend` by hostname. If you named your backend service differently, ArgoCD will deploy it correctly from the Helm chart, but the Nginx upstream will fail.

The Helm chart's `service.yaml` must include:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: backend
spec:
  selector:
    app: chatapp-backend
  ports:
  - port: 80
    targetPort: 8000
  type: ClusterIP
```

After fixing this and pushing to git, ArgoCD will auto-sync and the frontend pod will stop crashing.

### 8.4 Verify Pods

```bash
kubectl get pods -n prod
```

Both `chatapp-backend` and `chatapp-frontend` should show `1/1 Running`.

---

## Common Errors and Solutions

### Error: apt lock during Jenkins install

```
E: Could not get lock /var/lib/apt/lists/lock. It is held by process 1256
```

**Solution:**

```bash
sudo systemctl stop unattended-upgrades
sudo rm -f /var/lib/apt/lists/lock /var/lib/dpkg/lock /var/lib/dpkg/lock-frontend
sudo apt update
```

---

### Error: Jenkins GPG key expired

```
W: GPG error: https://pkg.jenkins.io/debian-stable binary/ Release:
NO_PUBKEY 7198F4B714ABFC68
E: The repository is not signed.
```

**Solution:** Skip the apt approach entirely and use the WAR file method (Phase 5, step 5.4).

---

### Error: Jenkins requires Java 21

```
Running with Java 17, which is older than the minimum required version (Java 21).
Supported Java versions are: [21, 25]
```

**Solution:**

```bash
sudo apt install -y openjdk-21-jdk
sudo update-alternatives --set java /usr/lib/jvm/java-21-openjdk-amd64/bin/java
java -version
```

---

### Error: SSH key permission denied when saving

```
bash: /home/kishor/.ssh/gitops-key.pem: Permission denied
```

**Solution:**

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
rm -f ~/.ssh/gitops-key.pem  # remove existing read-only copy if present
# then re-create the key pair
```

---

### Error: IAM Role already exists

```
Error: creating IAM Role (chatapp-cluster-cluster-role): EntityAlreadyExists
```

**Solution:** Detach all policies and delete the roles manually, then re-apply:

```bash
aws iam detach-role-policy --role-name chatapp-cluster-cluster-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonEKSClusterPolicy

aws iam detach-role-policy --role-name chatapp-cluster-node-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy

aws iam detach-role-policy --role-name chatapp-cluster-node-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy

aws iam detach-role-policy --role-name chatapp-cluster-node-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly

aws iam delete-role --role-name chatapp-cluster-cluster-role
aws iam delete-role --role-name chatapp-cluster-node-role

terraform apply
```

---

### Error: EKS cluster not found for gitops-cluster

```
An error occurred (ResourceNotFoundException) when calling the DescribeCluster
operation: No cluster found for name: gitops-cluster
```

**Solution:** Check what clusters actually exist:

```bash
aws eks list-clusters --region ap-south-1
```

Use the correct cluster name in all subsequent commands (`chatapp-cluster` in this project, not `gitops-cluster`).

---

### Error: ImagePullBackOff — ECR repo does not exist

```
Failed to pull image "...devboard-backend:latest": not found
```

**Solution:** The ECR repository name in `values.yaml` does not match the actual repository. Check ECR:

```bash
aws ecr list-images --repository-name chatapp-backend --region ap-south-1
```

Update `helm/app-chart/values.yaml` to use the correct repository names (`chatapp-backend` and `chatapp-frontend`), push to git, and let ArgoCD re-sync.

---

### Error: Too many pods — FailedScheduling

```
0/1 nodes are available: 1 Too many pods.
```

**Solution:** Scale up the node group:

```bash
aws eks update-nodegroup-config \
  --cluster-name chatapp-cluster \
  --nodegroup-name chatapp-cluster-nodes \
  --scaling-config minSize=1,maxSize=3,desiredSize=2 \
  --region ap-south-1

kubectl get nodes -w
```

Wait for the second node to reach `Ready` status.

---

### Error: Frontend CrashLoopBackOff — nginx upstream not found

```
host not found in upstream "backend" in /etc/nginx/conf.d/default.conf
```

**Solution:** The Nginx config expects a Kubernetes service named `backend`. Your Helm chart's `service.yaml` must have a service with `name: backend` that selects the backend pods. After fixing the service name and pushing, ArgoCD will sync and the frontend will recover.

---

### Error: Jenkins GitHub App credential parse failure

```
Caused: java.lang.IllegalArgumentException: Couldn't parse private key for GitHub app,
make sure it's PKCS#8 format
```

**Solution:** You accidentally created a "GitHub App" type credential instead of "Username with password". Delete that credential and recreate it as:

```
Kind:     Username with password
ID:       github-token
Username: your-github-username
Password: your-github-PAT
```

---

### Error: Security group and subnet belong to different networks

```
An error occurred (InvalidParameterCombination): Security group sg-xxx and subnet
subnet-xxx belong to different networks.
```

**Solution:** The security group must belong to the same VPC as the subnet you are launching into. Query the default VPC and use the matching security group:

```bash
aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" \
  --query 'Vpcs[0].VpcId' --output text --region ap-south-1

aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=default" \
            "Name=vpc-id,Values=<VPC_ID_FROM_ABOVE>" \
  --query 'SecurityGroups[0].GroupId' --output text --region ap-south-1
```

---

### Error: Free Tier restriction blocking instance type

```
An error occurred (InvalidParameterCombination): The specified instance type is not
eligible for Free Tier.
```

**Solution:** Add a valid payment method in AWS Billing Console. Once billing is enabled, the restriction is lifted and you can launch t2.medium or t3.medium instances via CLI.

---

### Error: Empty reply from server on LoadBalancer IP

```
curl: (52) Empty reply from server
```

**Solution:** The service port and targetPort do not match. If Nginx in the frontend container listens on port 80, but the Kubernetes service is routing to port 3000, you get an empty response. Fix `service.yaml`:

```yaml
ports:
- port: 80
  targetPort: 80   # must match what Nginx listens on inside the container
```

Then verify endpoints:

```bash
kubectl get endpoints chatapp-frontend-svc -n prod
# Should show: 10.0.x.x:80
```

---

## Phase 9 — PostgreSQL Database Setup

The ChatApp backend requires a PostgreSQL database. Without it, the app starts but all API calls fail silently. The backend looks for a service named `db` on port 8000 (proxied through Nginx) and connects using a `DATABASE_URL` environment variable.

### 9.1 Add Bitnami Helm Repository

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update
```

### 9.2 Install PostgreSQL Without Persistence

Standard PostgreSQL Helm install uses a PersistentVolumeClaim. On EKS with the default storage class, this PVC remains in `Pending` state indefinitely if no EBS CSI driver is configured. Install without persistence to avoid this:

```bash
helm install db bitnami/postgresql \
  --namespace prod \
  --set auth.username=chatapp \
  --set auth.password=chatapp123 \
  --set auth.database=chatapp \
  --set primary.persistence.enabled=false
```

### 9.3 Wait for PostgreSQL Pod to be Running

```bash
kubectl get pods -n prod -w
```

Wait until `db-postgresql-0` shows `1/1 Running`. This takes about 30–60 seconds.

### 9.4 Set DATABASE_URL Environment Variable on Backend

The backend reads its database connection string from the `DATABASE_URL` environment variable. Patch the deployment to inject it:

```bash
kubectl set env deployment/chatapp-backend \
  -n prod \
  DATABASE_URL=postgresql://chatapp:chatapp123@db-postgresql.prod.svc.cluster.local:5432/chatapp
```

### 9.5 Restart Backend and Verify

```bash
kubectl rollout restart deployment/chatapp-backend -n prod

sleep 15 && kubectl logs -n prod \
  $(kubectl get pods -n prod -l app=chatapp-backend \
  -o jsonpath='{.items[0].metadata.name}') | tail -5
```

Expected output confirming database is connected:

```
INFO:app.main:Database tables created/verified.
INFO:     Started server process [1]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

### 9.6 Fix Backend Service Port for Nginx Proxy

The frontend's Nginx config proxies `/api/` requests to `http://backend:8000`. The Helm chart's `service.yaml` must expose the backend service on port 8000 (not port 80). Update and push:

```bash
cat > ~/Documents/AWSProject/chatapp/helm/app-chart/templates/service.yaml << 'EOF'
apiVersion: v1
kind: Service
metadata:
  name: chatapp-frontend-svc
spec:
  selector:
    app: chatapp-frontend
  ports:
  - port: 80
    targetPort: 80
  type: LoadBalancer
---
apiVersion: v1
kind: Service
metadata:
  name: backend
spec:
  selector:
    app: chatapp-backend
  ports:
  - port: 8000
    targetPort: 8000
  type: ClusterIP
EOF

cd ~/Documents/AWSProject/chatapp
git add helm/
git commit -m "fix: backend service port 8000 for nginx proxy"
git push origin main
```

ArgoCD will detect the change and sync automatically. Once it does, test the API:

```bash
curl -X POST \
  http://<FRONTEND_LOADBALANCER_URL>/api/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","username":"testuser","password":"test123"}'
```

A successful response means the full stack — frontend, Nginx proxy, backend API, and PostgreSQL — is working end to end.

---

### Error: Backend DB init failed — hostname "db" not found

```
ERROR:app.main:DB init failed: (psycopg2.OperationalError) could not translate
host name "db" to address: Name or service not known
```

**Cause:** The backend is trying to connect to a hostname `db` which does not resolve inside the cluster. This happens when `DATABASE_URL` is not set, so the app falls back to its default config which expects a service literally named `db`.

**Solution:** Inject the correct `DATABASE_URL` pointing to the full Kubernetes DNS name of the PostgreSQL service:

```bash
kubectl set env deployment/chatapp-backend \
  -n prod \
  DATABASE_URL=postgresql://chatapp:chatapp123@db-postgresql.prod.svc.cluster.local:5432/chatapp

kubectl rollout restart deployment/chatapp-backend -n prod
```

---

### Error: PostgreSQL pod stuck in Pending — unbound PersistentVolumeClaim

```
Warning  FailedScheduling  pod has unbound immediate PersistentVolumeClaims.
preemption: 0/3 nodes are available.
```

**Cause:** The default Bitnami PostgreSQL chart requests a PersistentVolumeClaim. If EBS CSI driver is not installed on the cluster, no StorageClass can fulfill the claim and the pod stays Pending indefinitely.

**Solution:** Uninstall and reinstall PostgreSQL with persistence disabled:

```bash
helm uninstall db -n prod

helm install db bitnami/postgresql \
  --namespace prod \
  --set auth.username=chatapp \
  --set auth.password=chatapp123 \
  --set auth.database=chatapp \
  --set primary.persistence.enabled=false
```

---

### Error: Backend connects to DB but Sign Up still fails — API returns empty reply

```
curl: (52) Empty reply from server
```

**Cause:** After the database is up, registration API calls still fail because the Nginx `proxy_pass` points to `http://backend:8000` but the Kubernetes service named `backend` was configured with `port: 80` targeting the backend pod. Port 80 hits Nginx again instead of the Flask/Uvicorn server on 8000.

**Solution:** The `backend` ClusterIP service in `service.yaml` must use `port: 8000` and `targetPort: 8000`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: backend
spec:
  selector:
    app: chatapp-backend
  ports:
  - port: 8000
    targetPort: 8000
  type: ClusterIP
```

Push the fix, let ArgoCD sync, then verify endpoints:

```bash
kubectl get endpoints backend -n prod
# Expected: 10.0.x.x:8000
```

---

## End-to-End Workflow

This section describes what happens from the moment a developer pushes code to when it reaches production.

**Step 1 — Developer pushes to GitHub main branch.**

**Step 2 — GitHub Actions CI triggers automatically:**
- Checks out code
- Builds Docker images for backend and frontend
- Runs Trivy security scan against the images
- Pushes tagged images to Amazon ECR
- The entire CI run takes approximately 3–5 minutes

**Step 3 — Jenkins CD pipeline is triggered** (manually or via webhook):
- Authenticates with AWS and EKS
- Logs into ECR
- Deploys to the target environment (dev, staging, or prod)
- For prod, it pauses at the Manual Approval stage and waits for an operator to click Deploy in the Blue Ocean UI

**Step 4 — ArgoCD continuously watches the GitHub repo:**
- Polls every 3 minutes for changes to `helm/app-chart/`
- When it detects a diff between the Git state and cluster state, it marks the app as OutOfSync
- It then runs a Helm upgrade against the cluster automatically
- Status returns to Synced and Healthy within ~1 minute

**Step 5 — Kubernetes reconciles the deployment:**
- Rolling update starts for the affected deployment
- Old pods terminate after new pods are ready
- No downtime for the application

**Step 6 — Grafana dashboards update in real-time:**
- Node Exporter reports CPU, RAM, Disk, and Network metrics
- Prometheus scrapes all targets every 15–30 seconds
- Any anomaly shows up on the dashboard within 1 minute

**Step 7 — Application is accessible to end users** via the AWS LoadBalancer URL on port 80.

---

## Useful Commands Reference

### Check cluster and nodes

```bash
kubectl get nodes
kubectl get pods --all-namespaces
kubectl top nodes
```

### Check application status

```bash
kubectl get pods -n prod
kubectl get svc -n prod
kubectl logs -n prod <pod-name>
kubectl describe pod <pod-name> -n prod
```

### ArgoCD manual sync

```bash
# Or use the UI — SYNC button
kubectl -n argocd get app chatapp
```

### Jenkins restart (WAR method)

```bash
# On Jenkins EC2
ps aux | grep jenkins.war
kill <PID>
nohup java -jar ~/jenkins.war --httpPort=8080 > ~/jenkins.log 2>&1 &
```

### Scale node group

```bash
aws eks update-nodegroup-config \
  --cluster-name chatapp-cluster \
  --nodegroup-name chatapp-cluster-nodes \
  --scaling-config minSize=1,maxSize=3,desiredSize=2 \
  --region ap-south-1
```

### Rebuild and push images manually

```bash
aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS \
  --password-stdin 182138815046.dkr.ecr.ap-south-1.amazonaws.com

cd app/chatapp/backend
docker build -t chatapp-backend:latest .
docker tag chatapp-backend:latest 182138815046.dkr.ecr.ap-south-1.amazonaws.com/chatapp-backend:latest
docker push 182138815046.dkr.ecr.ap-south-1.amazonaws.com/chatapp-backend:latest
```

### Verify Grafana and Prometheus

```bash
kubectl get pods -n monitoring
kubectl get svc -n monitoring
```

### Destroy all infrastructure

```bash
cd ~/Documents/AWSProject/chatapp/terraform/envs/dev
terraform destroy
# Type 'yes' and wait 15–20 min

# Clean up ECR
aws ecr delete-repository --repository-name chatapp-backend --force --region ap-south-1
aws ecr delete-repository --repository-name chatapp-frontend --force --region ap-south-1
```

---

## Jenkins Credentials Summary

| Credential ID | Type | Purpose |
|---|---|---|
| aws-credentials | AWS Credentials | ECR login, EKS kubeconfig update |
| github-token | Username with password | GitHub repo checkout in pipeline |
| kubeconfig | Secret file | Direct kubectl access from pipeline |

---

## Key Ports Reference

| Service | Port | Access |
|---|---|---|
| Jenkins UI | 8080 | Public (EC2 Security Group) |
| SSH to Jenkins EC2 | 22 | Public (EC2 Security Group) |
| ArgoCD UI | 443 | Public (AWS LoadBalancer) |
| Grafana | 80 | Public (AWS LoadBalancer) |
| ChatApp Frontend | 80 | Public (AWS LoadBalancer) |
| Backend API (internal) | 8000 | Cluster-internal only (ClusterIP) |

---

## Project Completion Checklist

- [x] Phase 1 — Local tools installed (AWS CLI, kubectl, Terraform, Helm, Docker)
- [x] Phase 2 — GitHub repo structure set up
- [x] Phase 3 — Terraform applied, EKS cluster running with 2 nodes
- [x] Phase 4 — Docker images built and pushed to ECR
- [x] Phase 5 — Jenkins installed on EC2, pipeline running (12 builds completed)
- [x] Phase 6 — ArgoCD installed, chatapp application synced and healthy
- [x] Phase 7 — Prometheus + Grafana deployed, dashboards configured
- [x] Phase 8 — Application accessible via LoadBalancer URL
- [x] Phase 9 — PostgreSQL deployed, DATABASE_URL configured, Sign Up / Sign In working
