data "aws_availability_zones" "available" { state = "available" }

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 2)
  services = {
    admin-web    = { image = var.container_images.admin_web, port = 3000, host = var.admin_hostname, priority = 10 }
    customer-web = { image = var.container_images.customer_web, port = 3001, host = var.customer_hostname, priority = 20 }
    api          = { image = var.container_images.api, port = 4000, host = var.api_hostname, priority = 30 }
    worker       = { image = var.container_images.worker, port = 0, host = "", priority = 0 }
  }
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
}
resource "aws_internet_gateway" "main" { vpc_id = aws_vpc.main.id }

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  availability_zone       = local.azs[count.index]
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, count.index)
  map_public_ip_on_launch = false
}
resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + 8)
}
resource "aws_eip" "nat" { domain = "vpc" }
resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
  depends_on    = [aws_internet_gateway.main]
}
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
}
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }
}
resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}
resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

resource "aws_kms_key" "data" {
  description             = "Quantum Parks ${var.environment} data"
  enable_key_rotation     = true
  deletion_window_in_days = 30
}
resource "aws_kms_alias" "data" {
  name          = "alias/quantum-parks-${var.environment}"
  target_key_id = aws_kms_key.data.key_id
}

resource "aws_s3_bucket" "raw_evidence" {
  bucket_prefix = "qp-${var.environment}-raw-evidence-"
  force_destroy = false
}
resource "aws_s3_bucket" "assets" {
  bucket_prefix = "qp-${var.environment}-assets-"
  force_destroy = false
}
resource "aws_s3_bucket_versioning" "raw" {
  bucket = aws_s3_bucket.raw_evidence.id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "raw" {
  bucket = aws_s3_bucket.raw_evidence.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.data.arn
    }
    bucket_key_enabled = true
  }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.data.arn
    }
    bucket_key_enabled = true
  }
}
resource "aws_s3_bucket_public_access_block" "raw" {
  bucket                  = aws_s3_bucket.raw_evidence.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_public_access_block" "assets" {
  bucket                  = aws_s3_bucket.assets.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_security_group" "alb" {
  name_prefix = "qp-${var.environment}-alb-"
  vpc_id      = aws_vpc.main.id
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
resource "aws_security_group" "app" {
  name_prefix = "qp-${var.environment}-app-"
  vpc_id      = aws_vpc.main.id
  ingress {
    from_port       = 3000
    to_port         = 4000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
resource "aws_security_group" "data" {
  name_prefix = "qp-${var.environment}-data-"
  vpc_id      = aws_vpc.main.id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }
  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }
}

resource "aws_db_subnet_group" "main" {
  name       = "qp-${var.environment}"
  subnet_ids = aws_subnet.private[*].id
}
resource "aws_db_instance" "postgres" {
  identifier                      = "qp-${var.environment}"
  engine                          = "postgres"
  engine_version                  = "17"
  instance_class                  = "db.t4g.medium"
  allocated_storage               = 100
  max_allocated_storage           = 1000
  storage_type                    = "gp3"
  storage_encrypted               = true
  kms_key_id                      = aws_kms_key.data.arn
  db_name                         = var.database_name
  username                        = var.database_username
  password                        = var.database_password
  db_subnet_group_name            = aws_db_subnet_group.main.name
  vpc_security_group_ids          = [aws_security_group.data.id]
  backup_retention_period         = var.environment == "production" ? 35 : 7
  deletion_protection             = var.environment == "production"
  skip_final_snapshot             = var.environment != "production"
  final_snapshot_identifier       = var.environment == "production" ? "qp-${var.environment}-final" : null
  performance_insights_enabled    = true
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  auto_minor_version_upgrade      = true
}

resource "aws_elasticache_subnet_group" "main" {
  name       = "qp-${var.environment}"
  subnet_ids = aws_subnet.private[*].id
}
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "qp-${var.environment}"
  description                = "Quantum Parks queues and cache"
  node_type                  = "cache.t4g.small"
  engine                     = "redis"
  engine_version             = "7.1"
  port                       = 6379
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.data.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = var.database_password
  automatic_failover_enabled = var.environment == "production"
  multi_az_enabled           = var.environment == "production"
  num_cache_clusters         = var.environment == "production" ? 2 : 1
}

resource "aws_secretsmanager_secret" "elevenlabs_api" {
  name       = "quantum-parks/${var.environment}/elevenlabs/api-key"
  kms_key_id = aws_kms_key.data.arn
}
resource "aws_secretsmanager_secret" "elevenlabs_webhook" {
  name       = "quantum-parks/${var.environment}/elevenlabs/webhook-secret"
  kms_key_id = aws_kms_key.data.arn
}
resource "aws_secretsmanager_secret" "oidc" {
  name       = "quantum-parks/${var.environment}/oidc/client"
  kms_key_id = aws_kms_key.data.arn
}
resource "aws_secretsmanager_secret" "database_url" {
  name       = "quantum-parks/${var.environment}/database/url"
  kms_key_id = aws_kms_key.data.arn
}
resource "aws_secretsmanager_secret" "tool_token" {
  name       = "quantum-parks/${var.environment}/elevenlabs/tool-token"
  kms_key_id = aws_kms_key.data.arn
}
resource "aws_secretsmanager_secret" "metrics_token" {
  name       = "quantum-parks/${var.environment}/observability/metrics-token"
  kms_key_id = aws_kms_key.data.arn
}

resource "aws_ecs_cluster" "main" {
  name = "quantum-parks-${var.environment}"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}
resource "aws_iam_role" "execution" {
  name               = "qp-${var.environment}-ecs-execution"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }] })
}
resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
resource "aws_iam_role_policy" "execution_secrets" {
  role = aws_iam_role.execution.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = compact([aws_secretsmanager_secret.elevenlabs_api.arn, aws_secretsmanager_secret.elevenlabs_webhook.arn, aws_secretsmanager_secret.database_url.arn, aws_secretsmanager_secret.tool_token.arn, aws_secretsmanager_secret.metrics_token.arn, var.openai_api_secret_arn]) },
    { Effect = "Allow", Action = ["kms:Decrypt"], Resource = [aws_kms_key.data.arn] }
  ] })
}
resource "aws_iam_role" "api_task" {
  name               = "qp-${var.environment}-api-task"
  assume_role_policy = aws_iam_role.execution.assume_role_policy
}
resource "aws_iam_role_policy" "api_evidence" {
  role = aws_iam_role.api_task.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["s3:PutObject"], Resource = ["${aws_s3_bucket.raw_evidence.arn}/*"] },
    { Effect = "Allow", Action = ["kms:Encrypt", "kms:GenerateDataKey"], Resource = [aws_kms_key.data.arn] }
  ] })
}

resource "aws_cloudwatch_log_group" "service" {
  for_each          = local.services
  name              = "/quantum-parks/${var.environment}/${each.key}"
  retention_in_days = var.environment == "production" ? 90 : 30
  kms_key_id        = aws_kms_key.data.arn
}
resource "aws_ecs_task_definition" "service" {
  for_each                 = local.services
  family                   = "qp-${var.environment}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = each.key == "worker" ? 1024 : 512
  memory                   = each.key == "worker" ? 2048 : 1024
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = each.key == "api" ? aws_iam_role.api_task.arn : null
  container_definitions = jsonencode([{
    name         = each.key, image = each.value.image, essential = true, readonlyRootFilesystem = true,
    portMappings = each.value.port == 0 ? [] : [{ containerPort = each.value.port, protocol = "tcp" }],
    environment = [
      { name = "QP_ENVIRONMENT", value = var.environment },
      { name = "REDIS_URL", value = "rediss://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379" },
      { name = "TEMPORAL_ADDRESS", value = var.temporal_address },
      { name = "TEMPORAL_NAMESPACE", value = var.temporal_namespace },
      { name = "S3_BUCKET_RAW", value = aws_s3_bucket.raw_evidence.id },
      { name = "S3_BUCKET_ASSETS", value = aws_s3_bucket.assets.id },
      { name = "S3_REGION", value = var.aws_region },
      { name = "S3_KMS_KEY_ID", value = aws_kms_key.data.arn },
      { name = "OIDC_ISSUER", value = var.oidc_issuer },
      { name = "OIDC_CLIENT_ID", value = var.oidc_client_id },
      { name = "OIDC_AUDIENCE", value = var.oidc_audience },
      { name = "OIDC_CLIENT_SECRET_REF", value = aws_secretsmanager_secret.oidc.arn },
      { name = "ELEVENLABS_BASE_URL", value = var.elevenlabs_base_url },
      { name = "ELEVENLABS_WORKSPACE_ID", value = var.elevenlabs_workspace_id },
      { name = "ELEVENLABS_SECRET_REF", value = aws_secretsmanager_secret.elevenlabs_api.arn },
      { name = "ELEVENLABS_WEBHOOK_SECRET_REF", value = aws_secretsmanager_secret.elevenlabs_webhook.arn },
      { name = "ELEVENLABS_CAPABILITY_MODE", value = "live" },
      { name = "ENRICHMENT_PROVIDER", value = var.enrichment_provider },
      { name = "OPENAI_SECRET_REF", value = var.openai_api_secret_arn == null ? "NOT_CONFIGURED" : var.openai_api_secret_arn },
      { name = "OPENAI_MODEL", value = var.openai_model },
      { name = "AUDIO_INGESTION_ENABLED", value = "false" },
      { name = "CUSTOM_VOICE_ENABLED", value = "false" },
      { name = "BOOKING_WRITES_ENABLED", value = "false" },
      { name = "PRODUCTION_RETENTION_APPROVED", value = tostring(var.production_retention_approved) },
      { name = "PROVIDER_PRIVACY_APPROVED", value = tostring(var.provider_privacy_approved) },
      { name = "CALLER_DISCLOSURE_APPROVED", value = tostring(var.caller_disclosure_approved) },
      { name = "NATIVE_LANGUAGE_APPROVALS", value = var.native_language_approvals },
      { name = "ACTIVE_OPERATOR_QUEUES", value = tostring(var.active_operator_queues) },
      { name = "ACTIVE_MESSAGE_TEMPLATES", value = tostring(var.active_message_templates) },
      { name = "CORS_ORIGINS", value = "https://${var.admin_hostname},https://${var.customer_hostname}" },
      { name = "API_INTERNAL_URL", value = "https://${var.api_hostname}/v1" }
    ],
    secrets = concat(
      contains(["api", "worker"], each.key) ? [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
        { name = "LOCAL_ELEVENLABS_API_KEY", valueFrom = aws_secretsmanager_secret.elevenlabs_api.arn }
      ] : [],
      each.key == "api" ? [
        { name = "LOCAL_ELEVENLABS_WEBHOOK_SECRET", valueFrom = aws_secretsmanager_secret.elevenlabs_webhook.arn },
        { name = "LOCAL_TOOL_TOKEN", valueFrom = aws_secretsmanager_secret.tool_token.arn },
        { name = "METRICS_TOKEN", valueFrom = aws_secretsmanager_secret.metrics_token.arn }
      ] : [],
      contains(["api", "worker"], each.key) && var.openai_api_secret_arn != null ? [
        { name = "OPENAI_API_KEY", valueFrom = var.openai_api_secret_arn }
      ] : []
    ),
    logConfiguration = { logDriver = "awslogs", options = { awslogs-group = aws_cloudwatch_log_group.service[each.key].name, awslogs-region = var.aws_region, awslogs-stream-prefix = "service" } },
    healthCheck      = each.value.port == 0 ? null : { command = ["CMD-SHELL", "node -e \"fetch('http://localhost:${each.value.port}/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""], interval = 30, timeout = 5, retries = 3, startPeriod = 30 }
  }])
}

resource "aws_lb" "main" {
  name                       = "qp-${var.environment}"
  internal                   = false
  load_balancer_type         = "application"
  security_groups            = [aws_security_group.alb.id]
  subnets                    = aws_subnet.public[*].id
  enable_deletion_protection = var.environment == "production"
}
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn
  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Not found"
      status_code  = "404"
    }
  }
}
resource "aws_lb_target_group" "service" {
  for_each    = { for key, value in local.services : key => value if value.port > 0 }
  name        = substr("qp-${var.environment}-${each.key}", 0, 32)
  port        = each.value.port
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"
  health_check {
    path    = each.key == "api" ? "/health" : "/"
    matcher = "200-399"
  }
}
resource "aws_lb_listener_rule" "service" {
  for_each     = aws_lb_target_group.service
  listener_arn = aws_lb_listener.https.arn
  priority     = local.services[each.key].priority
  dynamic "action" {
    for_each = each.key == "admin-web" ? [1] : []
    content {
      type  = "authenticate-cognito"
      order = 1
      authenticate_cognito {
        user_pool_arn       = var.cognito_user_pool_arn
        user_pool_client_id = var.oidc_client_id
        user_pool_domain    = var.cognito_user_pool_domain
      }
    }
  }
  action {
    order            = each.key == "admin-web" ? 2 : 1
    type             = "forward"
    target_group_arn = each.value.arn
  }
  condition {
    host_header { values = [local.services[each.key].host] }
  }
}
resource "aws_ecs_service" "service" {
  for_each               = local.services
  name                   = each.key
  cluster                = aws_ecs_cluster.main.id
  task_definition        = aws_ecs_task_definition.service[each.key].arn
  desired_count          = var.desired_count
  launch_type            = "FARGATE"
  enable_execute_command = false
  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = false
  }
  dynamic "load_balancer" {
    for_each = each.value.port > 0 ? [1] : []
    content {
      target_group_arn = aws_lb_target_group.service[each.key].arn
      container_name   = each.key
      container_port   = each.value.port
    }
  }
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
}

resource "aws_cloudwatch_metric_alarm" "ecs_running" {
  for_each            = local.services
  alarm_name          = "qp-${var.environment}-${each.key}-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 80
  dimensions          = { ClusterName = aws_ecs_cluster.main.name, ServiceName = aws_ecs_service.service[each.key].name }
}
