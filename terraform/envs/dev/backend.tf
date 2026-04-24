terraform {
  backend "s3" {
    bucket         = "chatapp-terraform-state-182138815046"
    key            = "dev/terraform.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "chatapp-terraform-lock"
    encrypt        = true
  }
}