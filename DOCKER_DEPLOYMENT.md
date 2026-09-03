# Docker Deployment Guide

## Prerequisites
- Docker & Docker Compose installed
- Gemini API key (get free tier at https://ai.google.dev)
- Cloudflare Tunnel token (for the `cloudflared` service in docker-compose.yml)

## Quick Start (5 minutes)

### 1. Setup Environment
```bash
# Copy to your mini server
scp -r /home/adiskniepe/projekt/learning user@your-server:/path/to/app

# SSH into server
ssh user@your-server
cd /path/to/app

# Create .env file from template
cp .env.example .env

# Edit with your values
nano .env
# Set:
# - DB_USER & DB_PASSWORD (used by both PostgreSQL and app)
# - AUTH_SECRET (generate: openssl rand -base64 32)
# - GEMINI_API_KEY (from Google AI Studio)
# - TUNNEL_TOKEN (for the cloudflared service)

# Important: DB_USER and DB_PASSWORD are shared between PostgreSQL and the app's
# DATABASE_URL connection string. They must match for the connection to work.
```

### 2. Run Docker Compose
```bash
# Build and start all services
docker-compose -f docker-compose.yml up -d

# Verify services are running
docker-compose ps

# Expected output:
# CONTAINER ID  IMAGE                NAMES
# xxxxxxxx      learning:latest      learning-app
# xxxxxxxx      postgres:17-alpine   learning-postgres
```

### 3. Initialize Database
```bash
# Run database migrations
docker-compose exec app npm run db:migrate

# Seed initial data (Security+ certification + domain skeleton)
docker-compose exec app npm run db:seed

# Generate the curriculum, lessons and questions.
# Without these two steps the dashboard only shows an empty course shell.
docker-compose exec app npm run content:draft-curriculum -- security-plus-sy0-701
docker-compose exec app npm run content:draft-lessons -- security-plus-sy0-701
```

### 4. Access Application
```
http://your-ip:3000
```

---

## Essential Docker Commands

### Start/Stop
```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# Restart services
docker-compose restart

# Stop and remove volumes (CAUTION: deletes database)
docker-compose down -v
```

### Logs
```bash
# View all logs
docker-compose logs -f

# View app logs only
docker-compose logs -f app

# View database logs only
docker-compose logs -f postgres

# View last 100 lines
docker-compose logs --tail 100
```

### Database Management
```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U postgres -d learning_pwa

# Backup database
docker-compose exec postgres pg_dump -U postgres learning_pwa > backup.sql

# Restore database
docker-compose exec -T postgres psql -U postgres learning_pwa < backup.sql
```

### App Management
```bash
# Execute command in app container
docker-compose exec app npm run db:seed

# Regenerate lessons (from step 6)
docker-compose exec app npm run content:draft-curriculum
docker-compose exec app npm run content:draft-lessons

# Validate content (admin)
docker-compose exec app npm run content:validate

# Get shell access
docker-compose exec app sh
```

### Admin role (R0.2)
`/admin` and all `/api/admin/**` routes require `users.role = 'admin'` (default
role is `learner`). After the operator registers a normal account via
`/register`, promote it once from inside the app container:

```bash
docker-compose exec app npm run user:set-role -- operator@example.com admin
```

Revoke the same way with `learner` instead of `admin`; the role is read fresh
from the database on every request, so a revoked admin loses access
immediately without needing to sign out.

### Troubleshooting
```bash
# Rebuild images
docker-compose build --no-cache

# Remove all Docker containers/images (CLEAN SLATE)
docker system prune -a

# Check container health
docker-compose exec app curl http://localhost:3000/api/me

# View environment variables
docker-compose config | grep -A 20 "environment:"
```

---

## Production Checklist

### Security
- [ ] Change `AUTH_SECRET` (use: `openssl rand -base64 32`)
- [ ] Change `DB_PASSWORD` to strong password
- [ ] Run on https (use reverse proxy like nginx)

### Performance
- [ ] Use `restart: always` (already in compose)
- [ ] Set resource limits in docker-compose
- [ ] Enable postgres backups (cron job)
- [ ] Monitor disk space (database grows)

### Maintenance
```bash
# Auto-backup daily (add to crontab)
0 2 * * * cd /path/to/app && docker-compose exec -T postgres pg_dump -U postgres learning_pwa > backups/backup_$(date +%Y%m%d).sql

# Clean old backups (keep 30 days)
0 3 * * * find /path/to/app/backups -mtime +30 -delete
```

---

## Nginx Reverse Proxy (Optional)

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Environment Variables Reference

| Variable | Description | Required | Used By | Notes |
|----------|-------------|----------|---------|-------|
| `DB_NAME` | Database name | Yes | PostgreSQL + app | Used in DATABASE_URL |
| `DB_USER` | Database user | Yes | PostgreSQL + app | Used in POSTGRES_USER and DATABASE_URL |
| `DB_PASSWORD` | Database password | Yes | PostgreSQL + app | Used in POSTGRES_PASSWORD and DATABASE_URL |
| `DATABASE_URL` | Full connection string | Yes | App only | Auto-generated from DB_* vars |
| `AUTH_SECRET` | Session encryption key (Auth.js) | Yes | App | Generate: `openssl rand -base64 32` |
| `TUNNEL_TOKEN` | Cloudflare Tunnel token | Yes | cloudflared | From Zero Trust dashboard |
| `GEMINI_API_KEY` | Google Gemini API key | No | App | From https://ai.google.dev |
| `NODE_ENV` | Environment mode | Yes | App | Set to `production` |

**Important:** `DB_USER` and `DB_PASSWORD` are shared between PostgreSQL container (POSTGRES_USER, POSTGRES_PASSWORD) and the app's DATABASE_URL. They must match.

---

## Performance Expectations

- **Startup time**: 30-60 seconds (first time)
- **Database init**: ~10 seconds
- **Memory usage**: 200-400MB (app + db)
- **Disk space**: 500MB minimum (grows with content)
- **Concurrent users**: 50-100 (adjust resources for more)

---

## Troubleshooting

### App won't start
```bash
# Check logs
docker-compose logs app

# Rebuild
docker-compose build --no-cache
docker-compose up -d
```

### Database connection fails
```bash
# Verify postgres is healthy
docker-compose ps

# Check connection
docker-compose exec app psql $DATABASE_URL -c "SELECT 1"
```

### Out of disk space
```bash
# Clean Docker system
docker system prune -a

# Check database size
docker-compose exec postgres psql -U postgres -c "SELECT pg_size_pretty(pg_database_size('learning_pwa'))"
```

### Reset everything (NUCLEAR OPTION)
```bash
# Stop and remove all
docker-compose down -v

# Remove images
docker-compose down --rmi all

# Start fresh
docker-compose build
docker-compose up -d
docker-compose exec app npm run db:seed
```
