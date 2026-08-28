# Project: SentinelFlow AI — Automated Code Quality, Testing & Bug Intelligence

## 1. Project Overview

**SentinelFlow AI** is an AI-assisted software quality workflow that connects **GitHub, automated testing, AI code review, Linear, and Slack**.

The system automatically evaluates pull requests and code changes, runs deterministic quality checks, uses AI to analyze failures and code risks, creates actionable Linear issues for confirmed defects, and communicates results through Slack.

### Core principle

> **Deterministic tools find evidence. AI interprets evidence. Linear tracks work. Slack communicates it.**

AI should not replace the test suite or act as the final authority on whether code is correct.

---

## 2. Goals

### Primary goals

- Automatically test every relevant GitHub pull request.
- Run linting, type checking, unit/integration tests, and security checks.
- Perform AI-assisted code review using PR diff + repository context.
- Analyze failed tests and distinguish likely code defects from infrastructure/flaky failures.
- Detect duplicate or already-known bugs.
- Automatically create Linear issues for high-confidence defects.
- Link Linear issues back to the GitHub PR, commit, test failure, and logs.
- Send concise results and alerts to Slack.
- Keep humans in control of merge and issue-resolution decisions.

### Non-goals for MVP

- Fully autonomous code merging.
- AI-generated production deployments.
- AI replacing deterministic tests.
- Autonomous modification of production code.
- Building a generic coding agent.

---

# 3. High-Level Architecture

```text
Developer
    |
    v
GitHub Pull Request
    |
    v
GitHub Actions / CI
    |
    +----------------------+
    |                      |
    v                      v
Deterministic Checks    Test Execution
    |                      |
    |                 +----+----------------+
    |                 |    |       |        |
    |                Unit Integration E2E Security
    |                 |    |       |        |
    +-----------------+----+-------+--------+
                       |
                       v
                Evidence Collector
                       |
                       v
                AI Quality Agent
                       |
          +------------+-------------+
          |            |             |
          v            v             v
      Code Review   Failure RCA   Bug Triage
          |            |             |
          +------------+-------------+
                       |
                       v
              Decision / Confidence
                       |
          +------------+-------------+
          |                          |
          v                          v
       Linear                       Slack
    Bug / Issue                 Notification
          |
          v
   Developer / PM Review
          |
          v
     GitHub PR Update
```

---

# 4. Core Components

## 4.1 GitHub

GitHub is the source-control and pull-request system.

Responsibilities:

- Repository source code.
- Pull requests.
- Commit history.
- Branch protection.
- PR checks.
- GitHub Actions.
- Review comments.
- CI artifacts.
- Test reports.

### GitHub events

Primary events:

- `pull_request.opened`
- `pull_request.synchronize`
- `pull_request.reopened`
- `pull_request.closed`
- `push` where required
- workflow completion events

The workflow should avoid running expensive AI analysis unnecessarily.

---

# 5. CI/CD Quality Pipeline

Every eligible PR should execute a quality pipeline.

## Stage 1 — Fast validation

Run first:

1. Dependency installation
2. Formatting check
3. Lint
4. Type checking
5. Unit tests

If these fail, continue collecting evidence where useful but avoid expensive AI operations unless configured otherwise.

## Stage 2 — Deeper validation

Depending on repository configuration:

- Integration tests
- API tests
- Database tests
- E2E tests
- Playwright
- Accessibility tests
- Build verification
- Container validation

## Stage 3 — Security

Recommended tools:

- Dependency vulnerability scanning
- Secret scanning
- SAST
- Semgrep or equivalent
- CodeQL where appropriate
- License checks where required

The exact tools should be configurable per repository.

---

# 6. AI Code Review Agent

The AI reviewer receives structured evidence rather than blindly receiving the entire repository.

## Inputs

- PR title
- PR description
- Git diff
- Changed files
- Relevant surrounding code
- Repository instructions
- Test results
- Lint/type-check results
- Security findings
- Existing Linear issues when relevant
- Previous review findings

## Review categories

The agent should evaluate:

### Correctness

- Logic errors
- Edge cases
- Incorrect assumptions
- Null/undefined handling
- Race conditions
- Error handling

### Security

- Injection risks
- Authentication/authorization mistakes
- Sensitive-data exposure
- Unsafe dependencies
- Secrets
- Input validation

### Reliability

- Retry problems
- Timeouts
- Failure handling
- Resource leaks
- Concurrency issues

### Maintainability

- Excessive complexity
- Duplication
- Poor abstractions
- Breaking architectural conventions

### Testing

- Missing tests
- Weak assertions
- Uncovered critical paths
- Incorrect test assumptions

---

# 7. AI Review Output

The agent should produce structured JSON internally.

Example:

```json
{
  "status": "changes_requested",
  "findings": [
    {
      "severity": "high",
      "confidence": 0.94,
      "category": "security",
      "file": "src/api/user.ts",
      "line": 84,
      "title": "Authorization check can be bypassed",
      "description": "The endpoint verifies authentication but does not verify ownership of the requested resource.",
      "evidence": "The resource ID comes directly from the request and the query is executed without an ownership constraint.",
      "recommended_fix": "Validate that the authenticated user owns or is authorized to access the resource.",
      "requires_ticket": true
    }
  ]
}
```

The JSON becomes the machine-readable contract between the AI layer and downstream automation.

---

# 8. AI Test Failure Analysis

When CI fails, SentinelFlow should determine what actually happened.

## Failure classification

The agent should classify failures into:

- `REAL_BUG`
- `REGRESSION`
- `TEST_DEFECT`
- `FLAKY_TEST`
- `INFRA_FAILURE`
- `DEPENDENCY_FAILURE`
- `UNKNOWN`

Each classification gets:

- Confidence score
- Evidence
- Suggested next action

### Example

```text
Test: checkout_payment.spec.ts
Result: FAILED

AI classification:
REAL_BUG
Confidence: 0.91

Reason:
The API returns HTTP 500 when payment provider timeout occurs.
Expected behavior requires a controlled retry/failure response.
The regression was introduced by commit abc123.
```

AI must not mark a test as flaky simply because it failed once.

---

# 9. Bug Deduplication

Before creating a Linear issue, SentinelFlow should check whether the defect already exists.

## Matching signals

Use:

- Error message
- Stack trace
- Test name
- File/path
- Function
- PR
- Semantic similarity
- Existing Linear issue title/description
- Historical resolved issues

### Decision

```text
New defect
    |
    v
Search Linear
    |
    +---- Existing matching issue ----> Add evidence/comment
    |
    +---- No match -------------------> Create new issue
```

This prevents Linear from becoming a dumping ground of duplicate AI-generated tickets.

---

# 10. Linear Integration

Linear is the **system of record for engineering defects generated by the workflow**.

## Issue creation fields

Minimum:

- Title
- Description
- Team
- Priority
- Labels
- Source
- GitHub PR URL
- Commit SHA
- Failing test
- Error evidence
- AI confidence
- Suggested fix

Example title:

```text
[AI] Checkout API returns 500 on payment-provider timeout
```

## Recommended labels

```text
ai-detected
bug
security
regression
test-failure
flaky
needs-investigation
```

Labels should be configurable.

## Suggested issue structure

```markdown
## Summary

Checkout API fails with HTTP 500 when the payment provider times out.

## Detection

Detected automatically by SentinelFlow AI.

## GitHub

PR: #184
Commit: abc123

## Failing Test

checkout_payment.spec.ts

## Evidence

...

## AI Assessment

Severity: High
Confidence: 91%

## Suggested Fix

...

## CI Run

...
```

---

# 11. Slack Integration

Slack is the communication layer, not the source of truth.

## Notifications

### PR passed

```text
✅ SentinelFlow
PR #184 passed quality checks.

Tests: 248 passed
Security: Passed
AI Review: No high-confidence defects
```

### PR requires attention

```text
⚠️ SentinelFlow
PR #184 requires attention.

High-confidence findings: 2
Test failures: 1
Linear issues created: 1

View PR → ...
View Linear → ...
```

### New bug

```text
🐛 SentinelFlow detected a likely regression.

Severity: High
Confidence: 94%
PR: #184
Linear: ENG-482
```

---

# 12. Slack Interaction — Phase 2

Later, SentinelFlow can support commands such as:

```text
@sentinel status PR-184
@sentinel explain ENG-482
@sentinel rerun analysis PR-184
@sentinel summarize failures
```

The Slack agent should use controlled tools rather than unrestricted access.

---

# 13. Repository Context / RAG

The MVP should NOT ingest the entire repository into a vector database by default.

Start with targeted context retrieval.

## Context sources

- PR diff
- Changed files
- Imported modules
- Relevant tests
- Repository instructions
- Architecture documentation
- Coding standards
- Previous related Linear issues

## Retrieval strategy

```text
PR changed file
       |
       v
Dependency/import analysis
       |
       v
Relevant source files
       |
       v
Relevant tests
       |
       v
Repository rules
       |
       v
AI Review Context
```

A vector database can be introduced later if the repository becomes large or documentation retrieval becomes a bottleneck.

---

# 14. Agent Architecture

Do not create five autonomous agents for the MVP.

Use one orchestrating workflow with specialized logical stages.

## MVP agents

### 1. Review Agent

Analyzes code changes.

### 2. Failure Analysis Agent

Analyzes CI/test failures.

### 3. Bug Triage Agent

Determines severity, confidence, duplication, and Linear action.

These can initially run using the same model/service with separate prompts and schemas.

---

# 15. Tool Layer

The AI should never receive unrestricted credentials.

Expose controlled tools such as:

```text
get_pr()
get_pr_diff()
get_file()
get_related_files()
get_test_results()
get_ci_logs()
search_linear_issues()
create_linear_issue()
update_linear_issue()
add_github_comment()
get_repository_rules()
send_slack_notification()
```

Every tool call should be logged.

---

# 16. Recommended Technology Stack

## Core

- GitHub
- GitHub Actions
- Linear
- Slack

## Application

Recommended:

- TypeScript
- Node.js
- Next.js for dashboard/API if a UI is required
- PostgreSQL for workflow state
- Redis/queue only when scale requires it

## Testing

Use the project's existing test framework first.

Potential tools:

- Vitest/Jest
- Playwright
- Cypress
- Pytest
- Postman/Newman
- Supertest

Do not force a new test framework on the client.

## Static analysis

Potential:

- ESLint
- TypeScript compiler
- Semgrep
- CodeQL
- Dependency scanning

## AI

Model provider should be configurable.

Possible providers:

- OpenAI
- Anthropic
- Other enterprise-approved LLM provider

Use structured outputs/tool calling where supported.

---

# 17. GitHub Actions Workflow

Conceptual pipeline:

```yaml
name: SentinelFlow Quality

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  quality:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npm run typecheck

      - name: Unit tests
        run: npm test -- --coverage

      - name: E2E tests
        run: npm run test:e2e

      - name: Security checks
        run: npm audit --audit-level=high

      - name: Generate test artifacts
        if: always()
        run: npm run test:report

      - name: SentinelFlow AI analysis
        if: always()
        run: node scripts/sentinelflow-review.js
```

The exact commands must be adapted to the client's repository.

---

# 18. Workflow State

Store workflow executions in PostgreSQL.

Suggested entities:

```text
repositories
pull_requests
commits
workflow_runs
test_results
ai_reviews
ai_findings
linear_issues
slack_notifications
agent_runs
```

## Important fields

Every AI finding should maintain:

- Repository
- PR
- Commit SHA
- File
- Line
- Finding category
- Severity
- Confidence
- Evidence
- Model
- Prompt/version
- Created timestamp
- Resolution status

This is essential for debugging AI behavior later.

---

# 19. Confidence-Based Automation

Do not allow AI confidence to directly equal truth.

Recommended policy:

### High confidence

`>= 0.90`

Can:

- Create Linear issue automatically
- Comment on PR
- Notify Slack

### Medium confidence

`0.70–0.89`

Can:

- Comment on PR
- Notify Slack
- Recommend Linear issue
- Require human confirmation before ticket creation

### Low confidence

`< 0.70`

Should:

- Keep finding as an AI suggestion
- Avoid automatic ticket creation
- Avoid blocking PR

Thresholds must be configurable.

---

# 20. PR Decision Policy

Example:

```text
                    PR
                     |
                     v
             Deterministic CI
                     |
          +----------+----------+
          |                     |
        PASS                   FAIL
          |                     |
          v                     v
      AI Review           Failure Analysis
          |                     |
          +----------+----------+
                     |
                     v
              Findings/Triage
                     |
          +----------+----------+
          |                     |
       Critical              None/Low
          |                     |
          v                     v
    Block / Review         Approve path
```

The AI should not independently override branch-protection rules.

GitHub branch protection remains the enforcement mechanism.

---

# 21. Security Architecture

This system handles source code, CI logs, credentials, and potentially sensitive business logic.

## Requirements

- GitHub App preferred over long-lived personal access tokens.
- Least-privilege permissions.
- Encrypted secrets.
- No source-code logging in application logs.
- No raw credentials sent to LLMs.
- Redact secrets from CI logs before AI processing.
- Audit all AI tool calls.
- Validate webhook signatures.
- Restrict Linear and Slack permissions.
- Separate development and production credentials.

---

# 22. Human-in-the-Loop

Human review is mandatory for:

- Critical security findings
- Ambiguous defects
- Automatic code modifications
- Closing Linear issues
- Suppressing recurring findings
- Changing automation thresholds

The system should optimize engineering decisions, not remove engineering accountability.

---

# 23. MVP Scope

## Phase 1 — Foundation

### Deliverables

- GitHub App/webhook integration
- GitHub Actions workflow
- Test-result collection
- CI log collection
- AI review service
- Structured finding schema
- Linear integration
- Slack notifications
- Basic audit logging

### Success criteria

A developer opens a PR and SentinelFlow automatically processes it end-to-end.

---

# 24. Phase 2 — Intelligent Triage

Add:

- Failure classification
- Bug deduplication
- Related Linear issue search
- Historical issue context
- Confidence scoring
- Severity classification
- Better PR comments
- Flaky-test detection

---

# 25. Phase 3 — Engineering Intelligence

Add:

- Repository-aware retrieval
- Architecture/documentation context
- Historical defect analysis
- Team quality metrics
- Recurring failure detection
- Engineering dashboard
- AI quality trends
- Mean time to detection
- Mean time to resolution

---

# 26. Phase 4 — Controlled Remediation

Potential future capability:

```text
Detection
   ↓
Diagnosis
   ↓
Suggested patch
   ↓
Create branch
   ↓
Generate code change
   ↓
Run complete CI
   ↓
Open draft PR
   ↓
Human review
```

Do not implement autonomous production fixes in the MVP.

---

# 27. Example End-to-End Scenario

Developer creates:

```text
PR #184
"Handle payment provider timeout"
```

GitHub Actions runs:

```text
Lint             PASS
Typecheck        PASS
Unit Tests       PASS
Integration      PASS
E2E               FAIL
Security         PASS
```

SentinelFlow collects the failed E2E logs.

AI determines:

```text
Classification: REAL_BUG
Severity: HIGH
Confidence: 0.94
```

It searches Linear.

No matching issue exists.

SentinelFlow creates:

```text
ENG-482
Checkout API returns 500 on payment-provider timeout
```

Slack receives:

```text
🐛 SentinelFlow detected a high-confidence regression.

PR #184
Severity: High
Confidence: 94%
Linear: ENG-482
```

The GitHub PR receives a concise review comment with the evidence and Linear link.

The developer fixes the issue and pushes a new commit.

The pipeline runs again.

All checks pass.

SentinelFlow updates the PR status and notifies Slack.

---

# 28. Observability

Track:

### Pipeline metrics

- PRs analyzed
- Average analysis time
- CI duration
- AI analysis duration
- Failure rate

### AI metrics

- Findings per PR
- High-confidence findings
- False-positive rate
- Human-confirmed findings
- Duplicate issue rate
- AI cost per PR
- Token usage

### Engineering metrics

- Bugs detected before merge
- Bugs detected after merge
- Mean time to detection
- Mean time to resolution
- Recurring defects
- Flaky test frequency

---

# 29. AI Evaluation

This is critical.

Do not judge the system by how many issues AI creates.

Build an evaluation dataset from:

- Historical PRs
- Historical bugs
- Known regressions
- Existing Linear issues
- Known false positives

Measure:

```text
Precision
Recall
False Positive Rate
Duplicate Issue Rate
Severity Accuracy
Root Cause Accuracy
```

A useful quality gate is:

> Optimize for high precision on automatically created Linear bugs rather than maximum detection volume.

---

# 30. Cost Control

AI calls should be selective.

### Cheap operations first

1. GitHub metadata
2. Existing CI results
3. Static analysis
4. Test results
5. Targeted code retrieval
6. AI analysis only when required

Avoid sending:

- Entire repository
- Entire git history
- Unrelated files
- Huge CI logs

Use summaries and targeted context.

---

# 31. Recommended MVP Repository Structure

```text
sentinelflow/
├── apps/
│   └── api/
├── packages/
│   ├── github/
│   ├── linear/
│   ├── slack/
│   ├── ai/
│   ├── testing/
│   ├── security/
│   └── shared/
├── agents/
│   ├── review/
│   ├── failure-analysis/
│   └── triage/
├── workflows/
│   └── github-actions/
├── prompts/
│   ├── code-review.md
│   ├── failure-analysis.md
│   └── bug-triage.md
├── schemas/
│   ├── review.ts
│   ├── finding.ts
│   └── triage.ts
└── docs/
```

---

# 32. Acceptance Criteria

The MVP is complete when:

- [ ] GitHub PR triggers the workflow.
- [ ] Existing project tests execute automatically.
- [ ] Test results are captured.
- [ ] CI failures are captured.
- [ ] AI reviews PR changes.
- [ ] AI produces structured findings.
- [ ] Findings contain evidence and confidence.
- [ ] Linear issues can be created automatically.
- [ ] Existing Linear issues are checked for duplicates.
- [ ] GitHub PR receives review results.
- [ ] Slack receives success/failure notifications.
- [ ] Secrets are not exposed to the AI.
- [ ] Every AI action is auditable.
- [ ] Automation thresholds are configurable.
- [ ] Human approval remains available for uncertain findings.

---

# 33. Suggested Implementation Order

## Week 1

### Day 1–2

- Inspect client's GitHub repositories.
- Identify language/framework.
- Identify existing test framework.
- Identify CI/CD.
- Identify Linear teams/workflows.
- Identify Slack channels.
- Define GitHub permissions.

### Day 3–4

- Build GitHub integration.
- Build CI workflow.
- Capture test and build results.
- Normalize CI evidence.

### Day 5

- Implement AI review.
- Define structured finding schema.
- Add PR comments.

## Week 2

### Day 6–7

- Linear API integration.
- Duplicate detection.
- Automatic issue creation.

### Day 8

- Slack integration.
- Notifications.

### Day 9

- Failure-analysis workflow.
- Confidence/severity rules.

### Day 10

- End-to-end testing.
- Security review.
- Documentation.
- Demo.

---

# 34. Final Product Definition

**SentinelFlow AI** is not simply an AI code reviewer.

It is an **AI-powered engineering quality control loop**:

```text
        CODE
          ↓
       GITHUB
          ↓
     AUTOMATED CI
          ↓
 TESTS + SECURITY + STATIC ANALYSIS
          ↓
      AI ANALYSIS
          ↓
  ┌───────┴────────┐
  ↓                ↓
CODE REVIEW     BUG TRIAGE
  ↓                ↓
GITHUB           LINEAR
  └───────┬────────┘
          ↓
        SLACK
          ↓
       ENGINEER
          ↓
       FIX CODE
          ↓
       GITHUB CI
          ↺
```

The strongest selling point is the **closed feedback loop**:

**Detect → Analyze → Triage → Track → Fix → Re-test → Verify.**

That is the system the client is actually asking for.
