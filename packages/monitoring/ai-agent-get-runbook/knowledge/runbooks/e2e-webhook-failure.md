# E2E Webhook Failure

## Symptoms
- Webhook endpoint not accessible
- Returns unexpected HTTP status
- Deployment not triggered after push

## Immediate Actions
1. Test endpoint: `curl -X POST https://api.fleexstack.com/webhooks/github -H "Content-Type: application/json" -d '{"test":true}'`
2. Check webhook config in GitHub repo settings
3. Verify recent webhook deliveries: `gh api repos/OWNER/REPO/hooks/HOOK_ID/deliveries`

## Common Causes
- HAProxy not routing to backend
- SSL certificate issue
- Firewall blocking requests
- Application route not registered
- Invalid webhook secret

## Resolution Steps
1. Verify HAProxy config includes webhook route
2. Check SSL certificate validity: `openssl s_client -connect api.fleexstack.com:443`
3. Test from different network to rule out firewall
4. Check application logs for webhook handler errors
5. Redeliver webhook: `gh api repos/OWNER/REPO/hooks/HOOK_ID/deliveries/DELIVERY_ID/attempts -X POST`
