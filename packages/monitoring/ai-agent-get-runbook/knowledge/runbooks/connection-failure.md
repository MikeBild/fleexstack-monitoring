# Connection Failure

**Causes**: Network issues, service down, DNS resolution, firewall rules

**Check**:
- Network: `ping <host>`, `telnet <host> <port>`
- DNS: `nslookup <host>`
- Service status: Check target service health endpoint

**Fix**:
1. Verify target service is running
2. Check network connectivity
3. Review firewall/security group rules
4. Verify DNS resolution
5. Check for SSL/TLS certificate issues
