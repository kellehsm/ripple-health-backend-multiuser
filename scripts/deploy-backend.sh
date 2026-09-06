#!/usr/bin/env bash
# deploy-backend.sh — Build, push, and deploy the Ripple backend to ECS.
#
# Usage:
#   ./scripts/deploy-backend.sh             # build + push + deploy (no migrations)
#   ./scripts/deploy-backend.sh --migrate   # run migrations first, then deploy
#   ./scripts/deploy-backend.sh --migrate-only  # run migrations only, no deploy
#
# Run from the repo root (/root/wellness-app-multiuser or /root/wellness-app-multiuser-dev).
# Requires: docker, aws CLI, AWS_PROFILE=ripple-deploy configured.

set -euo pipefail

ECR_REPO="042396230124.dkr.ecr.us-east-1.amazonaws.com/ripple-backend"
REGION="us-east-1"
CLUSTER="ripple-cluster"
SERVICE="ripple-backend-svc"
TASK_DEF="ripple-backend"
SUBNET="subnet-0d0fb17d7171470db"
SG="sg-0f708042cafade4dd"
AWS_PROFILE="${AWS_PROFILE:-ripple-deploy}"

MIGRATE=false
MIGRATE_ONLY=false

for arg in "$@"; do
  case $arg in
    --migrate) MIGRATE=true ;;
    --migrate-only) MIGRATE=true; MIGRATE_ONLY=true ;;
  esac
done

echo "=== Ripple backend deploy ==="
echo "Profile: $AWS_PROFILE | Region: $REGION"
echo ""

# ── Migrations ────────────────────────────────────────────────────────────────

if [ "$MIGRATE" = true ]; then
  echo "▶ Running migrations as one-off ECS task..."
  TASK_ARN=$(AWS_PROFILE=$AWS_PROFILE aws ecs run-task \
    --cluster "$CLUSTER" \
    --task-definition "$TASK_DEF" \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNET],securityGroups=[$SG],assignPublicIp=ENABLED}" \
    --overrides '{"containerOverrides":[{"name":"ripple-backend","command":["node","run-migrations.mjs"]}]}' \
    --region "$REGION" \
    --query 'tasks[0].taskArn' --output text)

  echo "  Task ARN: $TASK_ARN"
  echo "  Waiting for migration task to complete..."
  AWS_PROFILE=$AWS_PROFILE aws ecs wait tasks-stopped \
    --cluster "$CLUSTER" --tasks "$TASK_ARN" --region "$REGION"

  EXIT_CODE=$(AWS_PROFILE=$AWS_PROFILE aws ecs describe-tasks \
    --cluster "$CLUSTER" --tasks "$TASK_ARN" --region "$REGION" \
    --query 'tasks[0].containers[0].exitCode' --output text)

  if [ "$EXIT_CODE" != "0" ]; then
    echo "✗ Migration task exited with code $EXIT_CODE — check CloudWatch: /ecs/ripple-backend"
    exit 1
  fi
  echo "✓ Migrations complete (exit 0)"
  echo ""

  if [ "$MIGRATE_ONLY" = true ]; then
    echo "Done (--migrate-only, skipping image build + deploy)."
    exit 0
  fi
fi

# ── Docker build + ECR push ───────────────────────────────────────────────────

echo "▶ Logging in to ECR..."
AWS_PROFILE=$AWS_PROFILE aws ecr get-login-password --region "$REGION" | \
  docker login --username AWS --password-stdin "042396230124.dkr.ecr.us-east-1.amazonaws.com"

echo ""
echo "▶ Building Docker image..."
docker build -t ripple-backend:latest ./backend

echo ""
echo "▶ Tagging and pushing to ECR..."
docker tag ripple-backend:latest "$ECR_REPO:latest"
docker push "$ECR_REPO:latest"
echo "✓ Image pushed: $ECR_REPO:latest"

# ── ECS force deploy ─────────────────────────────────────────────────────────

echo ""
echo "▶ Forcing new ECS deployment..."
AWS_PROFILE=$AWS_PROFILE aws ecs update-service \
  --cluster "$CLUSTER" \
  --service "$SERVICE" \
  --force-new-deployment \
  --region "$REGION" \
  --query 'service.deployments[0].status' --output text

echo ""
echo "▶ Waiting for service to stabilise (this takes ~60–90s)..."
AWS_PROFILE=$AWS_PROFILE aws ecs wait services-stable \
  --cluster "$CLUSTER" --services "$SERVICE" --region "$REGION"

# ── Health check ─────────────────────────────────────────────────────────────

echo ""
echo "▶ Verifying health endpoint..."
HTTP=$(curl -s -o /dev/null -w "%{http_code}" https://app.kels.gg/health)
if [ "$HTTP" = "200" ]; then
  echo "✓ https://app.kels.gg/health → $HTTP"
  echo ""
  echo "=== Deploy complete ==="
else
  echo "✗ Health check returned HTTP $HTTP — investigate before assuming success."
  exit 1
fi
