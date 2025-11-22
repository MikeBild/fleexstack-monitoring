# Database Connection Pool Exhaustion

**Date**: 2024-01-15
**Duration**: 45 min
**Severity**: High
**Repo**: [MikeBild/fleexstack](https://github.com/MikeBild/fleexstack)

## Summary
API 500 errors due to DB pool exhaustion after marketing campaign traffic spike.

## Timeline
- 14:30 - High error rate alert
- 14:40 - Found connection timeout errors
- 14:45 - Pool maxed at 10 connections
- 14:50 - Increased to 30, restarted
- 15:15 - Resolved

## Root Cause
Pool configured with only 10 connections. 3x traffic spike exhausted pool.

## Resolution
1. Increased pool from 10 to 30
2. Added 10s connection timeout
3. Added pool monitoring

## Action Items
- [x] Increase default pool size
- [x] Add pool exhaustion alert
- [ ] Connection pool autoscaling

## Lessons
- Default pool too conservative
- Alert on pool utilization, not just errors
