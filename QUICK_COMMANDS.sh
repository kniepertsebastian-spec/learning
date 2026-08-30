#!/bin/bash

# ============================================================================
# LEARNING PWA - DOCKER QUICK COMMANDS
# ============================================================================

echo "🚀 Learning PWA - Docker Deployment Commands"
echo "============================================================================"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}SETUP${NC}"
echo "1. Copy project to server:"
echo "   scp -r /home/adiskniepe/projekt/learning user@server:/opt/learning"
echo ""
echo "2. SSH and configure:"
echo "   ssh user@server"
echo "   cd /opt/learning"
echo "   cp .env.production.example .env.production"
echo "   nano .env.production  # Edit with your values"
echo ""
echo "3. Generate secrets:"
echo "   openssl rand -base64 32  # For NEXTAUTH_SECRET"
echo ""

echo -e "${BLUE}START & STOP${NC}"
echo "   docker-compose up -d                    # Start all services"
echo "   docker-compose down                     # Stop all services"
echo "   docker-compose restart                  # Restart services"
echo "   docker-compose ps                       # Check status"
echo ""

echo -e "${BLUE}INITIALIZE${NC}"
echo "   docker-compose exec app npm run db:migrate   # Run migrations"
echo "   docker-compose exec app npm run db:seed      # Seed data"
echo ""

echo -e "${BLUE}LOGS${NC}"
echo "   docker-compose logs -f                  # All logs"
echo "   docker-compose logs -f app              # App logs only"
echo "   docker-compose logs -f postgres         # DB logs only"
echo ""

echo -e "${BLUE}DATABASE${NC}"
echo "   docker-compose exec postgres psql -U postgres -d learning_pwa"
echo "   docker-compose exec postgres pg_dump -U postgres learning_pwa > backup.sql"
echo ""

echo -e "${BLUE}CONTENT GENERATION${NC}"
echo "   docker-compose exec app npm run content:draft-curriculum"
echo "   docker-compose exec app npm run content:draft-lessons"
echo ""

echo -e "${BLUE}TROUBLESHOOTING${NC}"
echo "   docker-compose build --no-cache        # Rebuild"
echo "   docker system prune -a                  # Clean everything"
echo "   docker-compose down -v                  # Remove all (with data)"
echo ""

echo -e "${YELLOW}ACCESS${NC}"
echo "   http://your-ip:3000"
echo "   http://your-ip:3000/admin               # Admin dashboard"
echo "   http://your-ip:3000/cert/security-plus # Certification"
echo ""

echo "============================================================================"
