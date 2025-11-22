# E2E Verification Integration

Integration guide for connecting fleexstack-platform E2E verification with the monitoring GenAI analysis.

## Overview

The `analyze-e2e-results` function receives E2E test results, analyzes failures with GenAI, and creates GitHub issues automatically.

## Setup

### 1. Deploy the monitoring functions

```bash
cd fleexstack-monitoring
doctl serverless deploy .
```

### 2. Get the function URL

```bash
doctl serverless functions get monitoring/analyze-e2e-results --url
```

### 3. Add to deploy-infrastructure.yml

Add this step to the `e2e-verify` job after the existing verification steps:

```yaml
      - name: Send results to monitoring
        if: always()
        run: |
          # Determine overall status
          all_passed="false"
          if [ "${{ steps.verify.outputs.all_passed }}" == "true" ]; then
            all_passed="true"
          fi

          # Build results payload
          results=$(cat << EOF
          {
            "allPassed": $all_passed,
            "blueHealth": "${{ steps.nodes.outputs.blue_health }}",
            "blueVersion": "${{ steps.nodes.outputs.blue_version }}",
            "greenHealth": "${{ steps.nodes.outputs.green_health }}",
            "greenVersion": "${{ steps.nodes.outputs.green_version }}",
            "versionVerified": ${{ steps.verify.outputs.version_verified || 'false' }},
            "expectedVersion": "${{ steps.version.outputs.version }}",
            "deployedVersion": "${{ steps.verify.outputs.deployed_version || 'unknown' }}",
            "httpsHealth": ${{ contains(env.HTTPS_HEALTH, '✅') }},
            "httpsGraphQL": ${{ contains(env.HTTPS_GRAPHQL, '✅') }},
            "webhookStatus": ${{ contains(env.WEBHOOK_STATUS, '✅') }}
          }
          EOF
          )

          # Send to monitoring
          curl -X POST "${{ vars.MONITORING_URL }}/monitoring/analyze-e2e-results" \
            -H "Content-Type: application/json" \
            -d "{
              \"workflowRun\": \"${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}\",
              \"environment\": \"${{ steps.env.outputs.environment }}\",
              \"version\": \"${{ steps.version.outputs.version }}\",
              \"commitSha\": \"${{ github.sha }}\",
              \"results\": $results
            }"
```

### 4. Add required variables

Add these to GitHub repository variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `MONITORING_URL` | Base URL for DO Functions | `https://faas-fra1-xxx.doserverless.co/api/v1/web/xxx` |

The function inherits `ALERTS_REPO` and `GH_TOKEN` from the package environment.

## Request Format

```json
{
  "workflowRun": "https://github.com/owner/repo/actions/runs/123",
  "environment": "blue",
  "version": "1.0.45",
  "commitSha": "abc123",
  "results": {
    "allPassed": false,
    "blueHealth": "healthy",
    "blueVersion": "1.0.45",
    "greenHealth": "down",
    "greenVersion": "unknown",
    "versionVerified": true,
    "expectedVersion": "1.0.45",
    "deployedVersion": "1.0.45",
    "httpsHealth": true,
    "httpsGraphQL": true,
    "webhookStatus": false
  }
}
```

## Response Format

```json
{
  "success": true,
  "status": "failed",
  "issuesCreated": 2,
  "failures": 2
}
```

## What Happens

1. **Success**: Records event in LogEntry for historical tracking
2. **Failure**:
   - Analyzes with GenAI using KB functions
   - Creates LogIssue entries with recommendations
   - Creates GitHub issue in ALERTS_REPO

## Runbooks

The following runbooks are available for E2E failures:

- `e2e-health-check-failure` - Node health check failures
- `e2e-version-mismatch` - Deployed version doesn't match expected
- `e2e-webhook-failure` - Webhook endpoint issues
- `e2e-haproxy-routing` - HAProxy backend routing problems

## Testing

```bash
# Test the function locally
curl -X POST "https://faas-fra1-xxx.doserverless.co/api/v1/web/xxx/monitoring/analyze-e2e-results" \
  -H "Content-Type: application/json" \
  -d '{
    "workflowRun": "test-run",
    "environment": "blue",
    "version": "1.0.0",
    "commitSha": "test123",
    "results": {
      "allPassed": false,
      "blueHealth": "down"
    }
  }'
```

## Removing the Old notify-failure Job

Once this integration is working, you can remove or simplify the `notify-failure` job in deploy-infrastructure.yml since issue creation is now handled by the monitoring function with AI-powered analysis.

## See Also

- [Knowledge Base Integration](./knowledge-base-integration.md) - Runbooks used by analyze-e2e-results
- [Developer Guide](./developers.md) - Function implementation patterns
- [Operator Guide](./operators.md) - Deployment and environment setup
