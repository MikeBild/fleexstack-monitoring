# Architecture Documentation

Complete workflow visualization of the FleexStack monitoring system.

## System Overview

```mermaid
graph TB
    subgraph "Scheduled Functions"
        SCH[scheduler<br/>Every 1 min]
        CL[collect-logs<br/>Every 5 min]
        AL[analyze-logs<br/>Every 15 min]
        DI[detect-issues<br/>Every 15 min]
        PI[predict-issues<br/>Hourly]
        SD[send-digest<br/>Daily 8 AM]
        CD[cleanup-data<br/>Daily 2 AM]
        VB[version-bump-bot<br/>Every 15 min]
    end

    subgraph "Infrastructure"
        Blue[Blue Node<br/>209.38.248.218]
        Green[Green Node<br/>209.38.209.155]
    end

    subgraph "Storage & AI"
        DB[(PostgreSQL<br/>LogEntry<br/>LogIssue)]
        GenAI[DO GenAI Agent]
    end

    SCH --> CL
    SCH --> AL
    SCH --> DI
    SCH --> PI
    SCH --> SD
    SCH --> CD
    SCH --> VB

    subgraph "External Repos"
        GH[GitHub API<br/>fleexstack-sample-app]
    end

    VB --> GH

    CL --> Blue
    CL --> Green
    CL --> DB
    AL --> DB
    AL --> GenAI
    DI --> DB
    PI --> DB
    SD --> DB
    CD --> DB

    style SCH fill:#ff9f43
    style CL fill:#4ecdc4
    style AL fill:#4ecdc4
    style DI fill:#4ecdc4
    style PI fill:#4ecdc4
    style SD fill:#4ecdc4
    style CD fill:#4ecdc4
    style VB fill:#4ecdc4
    style GenAI fill:#e1f5ff
    style GH fill:#f5f5f5
    style DB fill:#ffeaa7
```

## Data Flow

```mermaid
flowchart LR
    subgraph Sources
        B[Blue Node]
        G[Green Node]
    end

    subgraph Collection
        CL[collect-logs]
    end

    subgraph Storage
        LE[(LogEntry)]
        LI[(LogIssue)]
    end

    subgraph Analysis
        AL[analyze-logs]
        DI[detect-issues]
        PI[predict-issues]
    end

    subgraph External
        AI[GenAI]
    end

    subgraph Output
        SD[send-digest]
        CD[cleanup-data]
    end

    B -->|HTTP /logs| CL
    G -->|HTTP /logs| CL
    CL -->|INSERT| LE

    LE -->|SELECT unanalyzed| AL
    AL -->|API call| AI
    AI -->|JSON issues| AL
    AL -->|INSERT issues| LI
    AL -->|UPDATE analyzed=true| LE

    LE -->|SELECT last 15min| DI
    DI -->|INSERT issues| LI

    LE -->|SELECT 24h trend| PI
    LI -->|SELECT open count| PI
    PI -->|INSERT predictions| LI

    LE -->|SELECT stats| SD
    LI -->|SELECT issues| SD

    LE -->|DELETE old| CD
    LI -->|DELETE resolved| CD
```

## Function Workflows

### 1. collect-logs

```mermaid
sequenceDiagram
    participant S as Scheduler
    participant CL as collect-logs
    participant B as Blue Node
    participant G as Green Node
    participant DB as PostgreSQL

    S->>CL: Trigger (every 5 min)

    par Fetch from both nodes
        CL->>B: GET /logs
        B-->>CL: JSON logs array
        CL->>G: GET /logs
        G-->>CL: JSON logs array
    end

    loop For each log entry
        CL->>DB: INSERT INTO LogEntry
    end

    CL-->>S: Return {collected: N}
```

### 2. analyze-logs

```mermaid
sequenceDiagram
    participant S as Scheduler
    participant AL as analyze-logs
    participant DB as PostgreSQL
    participant AI as GenAI Agent

    S->>AL: Trigger (every 15 min)
    AL->>DB: SELECT * FROM LogEntry WHERE analyzed=false LIMIT 100
    DB-->>AL: Unanalyzed logs

    alt Has unanalyzed logs
        AL->>AI: POST /api/v1/chat/completions<br/>{messages: [system, logs]}
        AI-->>AL: JSON {issues: [...]}

        loop For each issue
            AL->>DB: INSERT INTO LogIssue (source='genai')
        end

        AL->>DB: UPDATE LogEntry SET analyzed=true
    end

    AL-->>S: Return {analyzed: N, issuesDetected: N}
```

### 3. detect-issues

```mermaid
sequenceDiagram
    participant S as Scheduler
    participant DI as detect-issues
    participant DB as PostgreSQL

    S->>DI: Trigger (every 15 min)

    DI->>DB: Count total & errors (last 15 min)
    DB-->>DI: {total, errors}

    alt Error rate > 5%
        DI->>DB: INSERT LogIssue (type='high-error-rate')
    end

    DI->>DB: Find repeated errors (count > 5)
    DB-->>DI: Repeated error messages

    loop For each repeated error
        DI->>DB: INSERT LogIssue (type='repeated-error')
    end

    DI->>DB: Count memory warnings
    alt Memory warnings > 3
        DI->>DB: INSERT LogIssue (type='memory-warning')
    end

    DI->>DB: Count connection errors
    alt Connection errors > 0
        DI->>DB: INSERT LogIssue (type='connection-failure')
    end

    DI-->>S: Return {issuesDetected: N}
```

### 4. predict-issues

```mermaid
sequenceDiagram
    participant S as Scheduler
    participant PI as predict-issues
    participant DB as PostgreSQL

    S->>PI: Trigger (every hour)

    PI->>DB: Get hourly trend (24h)
    DB-->>PI: Hourly stats

    Note over PI: Compare recent 3h vs previous 3h
    alt Error rate trending up > 50%
        PI->>DB: INSERT LogIssue (type='error-rate-trending-up')
    end

    PI->>DB: Get volume trend (6h)
    DB-->>PI: Hourly volumes

    alt Current volume > 2x average
        PI->>DB: INSERT LogIssue (type='log-volume-spike')
    end

    PI->>DB: Count open issues
    alt Open issues > 10
        PI->>DB: INSERT LogIssue (type='issue-backlog')
    end

    PI-->>S: Return {predictions: N}
```

### 5. send-digest

```mermaid
sequenceDiagram
    participant S as Scheduler
    participant SD as send-digest
    participant DB as PostgreSQL

    S->>SD: Trigger (daily 8 AM)

    SD->>DB: Get log stats (24h)
    DB-->>SD: {total, errors, by source}

    SD->>DB: Get open issues by severity
    DB-->>SD: Issue counts

    SD->>DB: Get recent critical issues
    DB-->>SD: Critical issue details

    Note over SD: Format digest report

    SD-->>S: Return {digest: {...}}
```

### 6. cleanup-data

```mermaid
sequenceDiagram
    participant S as Scheduler
    participant CD as cleanup-data
    participant DB as PostgreSQL

    S->>CD: Trigger (daily 2 AM)

    CD->>DB: DELETE FROM LogEntry<br/>WHERE createdAt < NOW() - 30 days
    DB-->>CD: Deleted count

    CD->>DB: DELETE FROM LogIssue<br/>WHERE status='resolved'<br/>AND resolvedAt < NOW() - 90 days
    DB-->>CD: Deleted count

    CD-->>S: Return {logsDeleted, issuesDeleted}
```

### 7. fleexstack-sample-app-version-bump-bot

```mermaid
sequenceDiagram
    participant S as Scheduler
    participant VB as version-bump-bot
    participant GH as GitHub API

    S->>VB: Trigger (every 15 min)

    VB->>GH: GET /repos/MikeBild/fleexstack-sample-app/contents/package.json
    GH-->>VB: {content: base64, sha: "..."}

    Note over VB: Decode, parse JSON,<br/>increment patch version

    VB->>GH: PUT /repos/.../contents/package.json<br/>{message, content, sha}
    GH-->>VB: {commit: {sha, html_url}}

    VB-->>S: Return {fromVersion, toVersion, commitSha}
```

## Issue Creation Flow

```mermaid
flowchart TD
    subgraph "Issue Sources"
        A[analyze-logs<br/>GenAI Analysis]
        D[detect-issues<br/>Pattern Detection]
        P[predict-issues<br/>Trend Prediction]
    end

    subgraph "Issue Types"
        AI_T[AI-detected issues<br/>Any anomaly found by AI]
        DET_T[high-error-rate<br/>repeated-error<br/>memory-warning<br/>connection-failure]
        PRE_T[error-rate-trending-up<br/>log-volume-spike<br/>issue-backlog]
    end

    subgraph "Storage"
        LI[(LogIssue Table)]
    end

    A -->|source='genai'| AI_T
    D -->|source='detector'| DET_T
    P -->|source='predictor'| PRE_T

    AI_T --> LI
    DET_T --> LI
    PRE_T --> LI

    style A fill:#74b9ff
    style D fill:#a29bfe
    style P fill:#fd79a8
```

## Database Schema

```mermaid
erDiagram
    LogEntry {
        uuid id PK
        timestamp timestamp
        varchar level
        text message
        varchar source
        varchar hostname
        jsonb metadata
        boolean analyzed
        timestamp createdAt
    }

    LogIssue {
        uuid id PK
        varchar type
        varchar severity
        varchar title
        text description
        text rootCause
        text recommendation
        varchar source
        varchar status
        timestamp detectedAt
        timestamp updatedAt
        timestamp resolvedAt
        jsonb metadata
        uuid[] affectedLogs
    }

    LogEntry ||--o{ LogIssue : "triggers"
```

## Timing Schedule

```mermaid
gantt
    title Function Execution Schedule (24h)
    dateFormat HH:mm
    axisFormat %H:%M

    section Every 5 min
    collect-logs    :crit, 00:00, 5m
    collect-logs    :crit, 00:05, 5m
    collect-logs    :crit, 00:10, 5m

    section Every 15 min
    analyze-logs    :active, 00:00, 5m
    detect-issues   :active, 00:00, 5m
    analyze-logs    :active, 00:15, 5m
    detect-issues   :active, 00:15, 5m

    section Hourly
    predict-issues  :00:00, 5m
    predict-issues  :01:00, 5m

    section Daily
    cleanup-data    :02:00, 10m
    send-digest     :08:00, 5m
```

## Environment Dependencies

```mermaid
flowchart LR
    subgraph "Required"
        DB_URL[DATABASE_URL]
        BLUE[BLUE_HOST]
        GREEN[GREEN_HOST]
    end

    subgraph "Optional"
        GENAI_URL[GENAI_AGENT_URL]
        GENAI_KEY[GENAI_API_KEY]
        ALERTS[ALERTS_REPO]
        GH[GH_TOKEN]
    end

    subgraph "Functions"
        CL[collect-logs]
        AL[analyze-logs]
        DI[detect-issues]
        PI[predict-issues]
        SD[send-digest]
        CD[cleanup-data]
    end

    DB_URL --> CL
    DB_URL --> AL
    DB_URL --> DI
    DB_URL --> PI
    DB_URL --> SD
    DB_URL --> CD

    BLUE --> CL
    GREEN --> CL

    GENAI_URL --> AL
    GENAI_KEY --> AL

    ALERTS --> SD
    GH --> SD
```

## Severity Levels

| Level | Color | Description | Action Required |
|-------|-------|-------------|-----------------|
| critical | Red | System down or data loss | Immediate |
| high | Orange | Service degradation | Within 1 hour |
| medium | Yellow | Potential issues | Within 24 hours |
| low | Blue | Informational | Review when convenient |

## Issue Lifecycle

```mermaid
stateDiagram-v2
    [*] --> open: Issue detected
    open --> open: Updated (occurrences++)
    open --> resolved: Manually resolved
    open --> resolved: Auto-resolved (pattern gone)
    resolved --> [*]: Cleaned up after 90 days

    note right of open: Active monitoring
    note right of resolved: Archived
```

## Issue Deduplication Flow

```mermaid
flowchart TD
    D[Pattern Detected] --> C{Existing open issue<br/>of same type?}
    C -->|Yes| U[Update existing issue<br/>- Increment occurrences<br/>- Update lastSeen]
    C -->|No| I[Insert new issue]
    U --> E[End]
    I --> E

    style D fill:#4ecdc4
    style U fill:#ffeaa7
    style I fill:#74b9ff
```

## Auto-Resolution Flow

```mermaid
flowchart TD
    R[Function runs] --> G[Get open issues<br/>older than grace period]
    G --> L{For each issue}
    L --> C{Pattern still<br/>detected?}
    C -->|Yes| K[Keep open]
    C -->|No| A[Auto-resolve<br/>- Set status=resolved<br/>- Add autoResolved metadata]
    K --> L
    A --> L
    L -->|Done| E[End]

    style R fill:#4ecdc4
    style A fill:#fd79a8
    style K fill:#a29bfe
```
