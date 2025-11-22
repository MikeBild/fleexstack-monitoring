# E2E Health Check Failure

## Symptoms
- Health endpoint returns non-200 status
- Application not responding on expected port
- Service systemd unit not running

## Immediate Actions
1. Check service status: `systemctl status fleexstack`
2. Check recent logs: `journalctl -u fleexstack --since "5 minutes ago"`
3. Verify port is listening: `ss -tlnp | grep 3000`
4. Check memory/disk: `free -h && df -h /opt`

## Common Causes
- Out of memory (OOM kill)
- Port already in use from previous deployment
- Missing environment variables
- Database connection failure
- Prisma client not generated

## Resolution Steps
1. If OOM: Restart service, consider memory limits
2. If port in use: `lsof -ti :3000 | xargs kill -9`
3. If env missing: Check `.env` file exists and is readable
4. If DB error: Verify DATABASE_URL and network connectivity
5. Restart: `systemctl restart fleexstack`
