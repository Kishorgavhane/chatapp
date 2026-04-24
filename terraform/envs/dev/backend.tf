terraform {
  backend "s3" {
    bucket         = "chatapp-tf-state-182138815046"
    key            = "dev/terraform.tfstate"
    region         = "ap-south-1"
    use_lockfile = true
    encrypt        = true
  }
}