# DO Spaces Docs Sync

Automatically sync GitHub docs to DO Spaces for GenAI Knowledge Base.

## Prerequisites

1. **Create DO Spaces bucket**: `fleexstack-docs` in `fra1` region
2. **Generate Spaces access keys**: 
   - Go to: https://cloud.digitalocean.com/account/api/spaces
   - Create new key pair
3. **Add secrets to fleexstack repo**:
   - `SPACES_ACCESS_KEY_ID`
   - `SPACES_SECRET_ACCESS_KEY`

## GitHub Action Workflow

Add this to `MikeBild/fleexstack/.github/workflows/sync-docs-to-spaces.yml`:

```yaml
name: Sync Docs to DO Spaces

on:
  push:
    branches: [main]
    paths:
      - 'docs/**'
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install s3cmd
        run: sudo apt-get install -y s3cmd

      - name: Configure s3cmd
        run: |
          cat > ~/.s3cfg << EOF
          [default]
          access_key = ${{ secrets.SPACES_ACCESS_KEY_ID }}
          secret_key = ${{ secrets.SPACES_SECRET_ACCESS_KEY }}
          host_base = fra1.digitaloceanspaces.com
          host_bucket = %(bucket)s.fra1.digitaloceanspaces.com
          EOF

      - name: Sync docs to Spaces
        run: |
          s3cmd sync --acl-public --delete-removed \
            docs/ s3://fleexstack-docs/docs/

      - name: Trigger KB re-indexing (optional)
        if: always()
        run: |
          echo "Docs synced. Re-index KB in DO Control Panel or via API."
```

## Add Spaces as KB Datasource

After creating the bucket and syncing docs:

```bash
doctl genai knowledge-base add-datasource 0afea794-c785-11f0-b074-4e013e2ddde4 \
  --bucket-name fleexstack-docs \
  --item-path /docs \
  --region fra1
```

## Attach KB to Agent

```bash
doctl genai knowledge-base attach ff26de2d-c32c-11f0-b074-4e013e2ddde4 0afea794-c785-11f0-b074-4e013e2ddde4
```

## Manual Sync

To sync docs manually:

```bash
# Clone fleexstack repo
git clone https://github.com/MikeBild/fleexstack.git
cd fleexstack

# Sync with s3cmd
s3cmd sync --acl-public docs/ s3://fleexstack-docs/docs/
```
