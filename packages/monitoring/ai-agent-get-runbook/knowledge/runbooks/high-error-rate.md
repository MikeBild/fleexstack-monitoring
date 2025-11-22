# High Error Rate

**Causes**: DB pool exhaustion, OOM, downstream failure

**Check**:
- DB: `SELECT count(*) FROM pg_stat_activity`
- Memory: `docker stats`

**Fix**:
1. Increase pool size
2. Restart service
3. Check downstream health
