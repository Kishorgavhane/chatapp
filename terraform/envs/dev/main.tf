module "vpc" {
  source = "../../modules/vpc"

  vpc_cidr             = "10.0.0.0/16"
  cluster_name         = "chatapp-cluster"
  environment          = "dev"
  public_subnet_cidrs  = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnet_cidrs = ["10.0.3.0/24", "10.0.4.0/24"]
  azs                  = ["ap-south-1a", "ap-south-1b"]
}

module "eks" {
  source = "../../modules/eks"

  cluster_name       = "chatapp-cluster"
  environment        = "dev"
  kubernetes_version = "1.32"
  public_subnet_ids  = module.vpc.public_subnet_ids
  private_subnet_ids = module.vpc.private_subnet_ids
  node_instance_type = "t3.small"
  desired_nodes      = 1
  min_nodes          = 1
  max_nodes          = 2
}