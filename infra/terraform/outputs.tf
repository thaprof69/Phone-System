output "load_balancer_dns_name" { value = aws_lb.main.dns_name }
output "raw_evidence_bucket" { value = aws_s3_bucket.raw_evidence.id }
output "assets_bucket" { value = aws_s3_bucket.assets.id }
output "database_endpoint" {
  value     = aws_db_instance.postgres.address
  sensitive = true
}
output "secret_references" {
  value = {
    elevenlabs_api     = aws_secretsmanager_secret.elevenlabs_api.arn
    elevenlabs_webhook = aws_secretsmanager_secret.elevenlabs_webhook.arn
    oidc               = aws_secretsmanager_secret.oidc.arn
    database_url       = aws_secretsmanager_secret.database_url.arn
    tool_token         = aws_secretsmanager_secret.tool_token.arn
    metrics_token      = aws_secretsmanager_secret.metrics_token.arn
  }
}
