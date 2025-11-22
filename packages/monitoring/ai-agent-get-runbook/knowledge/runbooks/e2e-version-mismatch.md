# E2E Version Mismatch

## Symptoms
- Deployed version differs from expected
- Old version still serving traffic
- HAProxy routing to wrong backend

## Immediate Actions
1. Check deployed version: `curl http://localhost:3000/api/info | jq .version`
2. Check package.json: `cat /opt/platform/fleexstack/package.json | jq .version`
3. Verify HAProxy backend state: `echo "show stat" | socat stdio /var/run/haproxy/admin.sock`

## Common Causes
- Deployment didn't complete successfully
- HAProxy still routing to old environment
- Cache serving stale response
- Webhook didn't trigger deployment

## Resolution Steps
1. Check deployment logs in GitHub Actions
2. Verify webhook delivery status
3. Manually deploy if needed: Re-run GitHub workflow
4. Switch HAProxy backend if wrong environment active
5. Clear any caches if applicable
