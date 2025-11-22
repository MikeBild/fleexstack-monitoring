# Memory Warning

**Causes**: Memory leak, large payloads, insufficient container memory

**Check**:
- Container: `docker stats`
- Process: `ps aux --sort=-%mem | head`
- Heap: Check application memory metrics

**Fix**:
1. Restart affected service
2. Check for memory leaks in recent deployments
3. Increase container memory limits
4. Review large payload handlers
