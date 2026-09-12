#!/usr/bin/env bash
# ==============================================================================
# MyVibeReader — DigitalOcean Droplet Initial Setup Script
# Run this once on a fresh Ubuntu 22.04 / 24.04 Droplet as root.
# ==============================================================================

set -euo pipefail

echo "======================================================================"
echo "🚀 Initializing MyVibeReader on DigitalOcean Droplet..."
echo "======================================================================"

# 1. Ensure Root Privileges
if [ "$(id -u)" -ne 0 ]; then
    echo "❌ Error: This script must be run as root (or with sudo)." >&2
    exit 1
fi

# 2. System Package Updates
echo "📦 Updating system packages..."
apt-get update -y && apt-get upgrade -y
apt-get install -y curl ufw git ca-certificates gnupg lsb-release

# 3. Configure 2GB Swap Memory (Vital for $4-$6/mo low-RAM Droplets)
SWAP_TOTAL=$(free -m | awk '/^Swap:/ {print $2}')
if [ "$SWAP_TOTAL" -lt 1024 ]; then
    echo "🧠 Configuring 2GB Swap space for memory stability..."
    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    if ! grep -q "/swapfile" /etc/fstab; then
        echo '/swapfile none swap sw 0 0' >> /etc/fstab
    fi
    sysctl vm.swappiness=10
    echo "vm.swappiness=10" >> /etc/sysctl.conf
    echo "✅ 2GB Swap space configured successfully."
else
    echo "✅ Swap space already present ($SWAP_TOTAL MB)."
fi

# 4. Install Docker & Docker Compose Plugin
if ! command -v docker &> /dev/null; then
    echo "🐳 Installing Docker Engine and Docker Compose..."
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null

    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable docker
    systemctl start docker
    echo "✅ Docker installed successfully."
else
    echo "✅ Docker is already installed."
fi

# 5. Configure UFW Firewall
echo "🛡️ Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP / ACME'
ufw allow 443/tcp comment 'HTTPS'
ufw allow 443/udp comment 'HTTP/3'
ufw --force enable
echo "✅ UFW Firewall enabled (Ports 22, 80, 443 open)."

# 6. Create Deployment Directory
DEPLOY_DIR="/opt/myvibereader"
echo "📁 Setting up deployment directory at $DEPLOY_DIR..."
mkdir -p "$DEPLOY_DIR"

echo "======================================================================"
echo "🎉 Droplet setup complete!"
echo ""
echo "Next Steps:"
echo "1. Copy docker-compose.prod.yml, Caddyfile, and .env.prod.example to $DEPLOY_DIR"
echo "2. Create /opt/myvibereader/.env from .env.prod.example and fill in your secrets"
echo "3. Run: docker compose -f $DEPLOY_DIR/docker-compose.prod.yml up -d"
echo "======================================================================"
