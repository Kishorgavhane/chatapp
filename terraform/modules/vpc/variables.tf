variable "vpc_cidr" {
  type = string
}

variable "cluster_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "public_subnet_cidrs" {
  type = list(string)
}

variable "private_subnet_cidrs" {
  type = list(string)
}

variable "azs" {
  type = list(string)
}