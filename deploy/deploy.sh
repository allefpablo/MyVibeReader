#!/usr/bin/env bash
# ==============================================================================
# MyVibeReader — Continuous Deployment Script
# Executes atomic container update with health verification.
# ==============================================================================

set -euo pipefail

DEPLOY_DIR="/opt/myvibereader"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.prod.yml"
ENV_FILE="$DEPLOY_DIR/.env"
IMAGE_TAG="${1:-}"

cd "$DEPLOY_DIR"

if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Error: $ENV_FILE not found. Please create it before deploying." >&2
    exit 1
fi

if [ ! -f "$COMPOSE_FILE" ]; then
    echo "❌ Error: $COMPOSE_FILE not found." >&2
    exit 1
fi

# If a specific image tag was provided as argument, update APP_IMAGE in .env
if [ -n "$IMAGE_TAG" ]; then
    echo "🏷️ Updating APP_IMAGE to $IMAGE_TAG in $ENV_FILE..."
    if grep -q "^APP_IMAGE=" "$ENV_FILE"; then
        sed -i "s|^APP_IMAGE=.*|APP_IMAGE=$IMAGE_TAG|" "$ENV_FILE"
    else
        echo "APP_IMAGE=$IMAGE_TAG" >> "$ENV_FILE"
    fi
fi

# Load environment variables
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

echo "🐳 Pulling latest application image: ${APP_IMAGE}..."
docker compose -f "$COMPOSE_FILE" pull app || true

echo "🔄 Starting services with updated container..."
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

echo "⏳ Verifying application health..."
MAX_ATTEMPTS=20
ATTEMPT=0
HEALTHY=false

while [ "$ATTEMPT" -lt "$MAX_ATTEMPTS" ]; do
    ATTEMPT=$((ATTEMPT + 1))
    echo "   Checking health (attempt $ATTEMPT/$MAX_ATTEMPTS)..."
    
    HEALTH_OUTPUT=$(docker compose -f "$COMPOSE_FILE" exec -T app wget -qO- http://localhost:8080/actuator/health 2>/dev/null || true)
    
    if echo "$HEALTH_OUTPUT" | grep -q '"status":"UP"'; then
        HEALTHY=true
        break
    fi
    sleep 3
done

if [ "$HEALTHY" = true ]; then
    echo "✅ Deployment successful! Application health status: UP"
    # Clean up old unused images to save disk space on small droplets
    docker image prune -f --filter "until=72h" > /dev/null 2>&1 || true
    exit 0
else
    echo "❌ Health check failed after $MAX_ATTEMPTS attempts!" >&2
    echo "--- Application Container Logs ---" >&2
    docker compose -f "$COMPOSE_FILE" logs --tail=50 app >&2
    exit 1
fi
