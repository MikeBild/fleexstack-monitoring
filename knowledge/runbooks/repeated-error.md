# Repeated Error

**Causes**: Systematic bug, bad input data, external dependency issue

**Check**:
- Logs: Search for error pattern and correlating requests
- Input: Check for malformed data or edge cases
- Dependencies: Verify external services are healthy

**Fix**:
1. Identify the specific error pattern
2. Check recent deployments for related changes
3. Review input validation
4. Add defensive error handling if needed
5. Consider circuit breaker for external dependencies
