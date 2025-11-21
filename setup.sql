-- FleexStack Monitoring Database Setup
-- Run this script against your PostgreSQL database

-- LogEntry table for storing collected logs
CREATE TABLE IF NOT EXISTS "LogEntry" (
  id UUID PRIMARY KEY,
  timestamp TIMESTAMP NOT NULL,
  level VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  source VARCHAR(20) NOT NULL,
  metadata JSONB,
  analyzed BOOLEAN DEFAULT false,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- LogIssue table for storing detected issues
CREATE TABLE IF NOT EXISTS "LogIssue" (
  id UUID PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  "rootCause" TEXT,
  recommendation TEXT,
  source VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'open',
  "detectedAt" TIMESTAMP NOT NULL,
  "resolvedAt" TIMESTAMP,
  metadata JSONB
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_logentry_timestamp ON "LogEntry"(timestamp);
CREATE INDEX IF NOT EXISTS idx_logentry_analyzed ON "LogEntry"(analyzed);
CREATE INDEX IF NOT EXISTS idx_logentry_level ON "LogEntry"(level);
CREATE INDEX IF NOT EXISTS idx_logentry_source ON "LogEntry"(source);
CREATE INDEX IF NOT EXISTS idx_logissue_status ON "LogIssue"(status);
CREATE INDEX IF NOT EXISTS idx_logissue_severity ON "LogIssue"(severity);
CREATE INDEX IF NOT EXISTS idx_logissue_detected ON "LogIssue"("detectedAt");
