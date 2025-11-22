# E2E HAProxy Routing Issue

## Symptoms
- Traffic not reaching expected backend
- Both backends in MAINT state
- Backend health checks failing

## Immediate Actions
1. Check backend states: `echo "show stat" | socat stdio /var/run/haproxy/admin.sock | grep fleexstack`
2. Check HAProxy config: `cat /etc/haproxy/haproxy.cfg | grep -A10 "backend fleexstack"`
3. Test direct backend access: `curl http://209.38.248.218:3000/health`

## Common Causes
- Backend marked as disabled in config
- Health check failing on backend
- HAProxy config syntax error
- Backend server actually down

## Resolution Steps
1. Enable backend via socket:
   ```bash
   echo "set server fleexstack_backend/blue state ready" | socat stdio /var/run/haproxy/admin.sock
   ```
2. Or modify config and reload:
   ```bash
   vim /etc/haproxy/haproxy.cfg  # remove 'disabled'
   haproxy -c -f /etc/haproxy/haproxy.cfg  # validate
   systemctl reload haproxy
   ```
3. If backend down, fix the backend first (see health-check-failure runbook)
4. Verify after fix: `curl https://api.fleexstack.com/health`
