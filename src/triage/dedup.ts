/**
 * SentinelFlow AI — Deduplication & Triage Engine
 * Prevents Linear issue spam by matching incoming failures against existing active tickets.
 */

import {
  PipelineEvidence,
  FailureAnalysisResult,
  ReviewResult,
  SecurityScanResult,
  TriageDecision,
  LinearIssuePayload,
  Severity,
} from '../types/index.js';

export interface LinearExistingIssueSummary {
  id: string;
  identifier: string; // e.g. ENG-123
  title: string;
  description?: string;
  url: string;
  state?: string;
}

export class TriageEngine {
  private autoTicketThreshold: number;

  constructor(autoTicketThreshold: number = 0.9) {
    this.autoTicketThreshold = autoTicketThreshold;
  }

  /**
   * Decide triage action for CI test failure or security finding.
   */
  public evaluateFailure(
    evidence: PipelineEvidence,
    analysis: FailureAnalysisResult,
    existingIssues: LinearExistingIssueSummary[] = [],
    teamKey: string = 'ENG'
  ): TriageDecision {
    // Check if confidence meets threshold
    if (analysis.confidence < this.autoTicketThreshold) {
      return {
        action: 'no_action',
        isDuplicate: false,
        confidence: analysis.confidence,
        rationale: `AI confidence (${(analysis.confidence * 100).toFixed(0)}%) is below auto-ticket threshold (${(this.autoTicketThreshold * 100).toFixed(0)}%). Finding flagged for manual PR review only.`,
      };
    }

    const testName = analysis.failingTest || evidence.testResults?.failures?.[0]?.testName || 'Test Suite';
    const issueTitle = `[AI] ${analysis.rootCauseSummary.slice(0, 80)}`;

    // Search for duplicate issues
    const match = this.findDuplicateIssue(testName, analysis.rootCauseSummary, existingIssues);

    if (match) {
      return {
        action: 'update_issue',
        existingIssueId: match.id,
        existingIssueUrl: match.url,
        isDuplicate: true,
        confidence: analysis.confidence,
        rationale: `Matching active defect found in Linear (${match.identifier}: "${match.title}"). Adding CI run evidence as comment.`,
      };
    }

    const payload: LinearIssuePayload = {
      title: issueTitle,
      description: this.formatFailureIssueDescription(evidence, analysis),
      teamKey,
      priority: analysis.classification === 'REAL_BUG' || analysis.isRegression ? 1 : 2, // 1 = Urgent, 2 = High
      labels: ['ai-detected', 'bug', 'regression', 'ci-failure'],
      prUrl: `https://github.com/${evidence.pr.owner}/${evidence.pr.repo}/pull/${evidence.pr.pullNumber}`,
      commitSha: evidence.pr.commitSha,
      severity: 'high',
      confidence: analysis.confidence,
      suggestedFix: analysis.suggestedFix,
    };

    return {
      action: 'create_issue',
      isDuplicate: false,
      confidence: analysis.confidence,
      rationale: `High-confidence defect detected (${(analysis.confidence * 100).toFixed(0)}%). No duplicate Linear issue found.`,
      issuePayload: payload,
    };
  }

  /**
   * Decide triage action for security / secret leak events.
   */
  public evaluateSecurityAlert(
    evidence: PipelineEvidence,
    security: SecurityScanResult,
    existingIssues: LinearExistingIssueSummary[] = [],
    teamKey: string = 'ENG'
  ): TriageDecision | null {
    if (security.passed) {
      return null;
    }

    const secretLeaks = security.secretLeaks;
    const cves = security.vulnerabilities.filter((v) => v.severity === 'critical' || v.severity === 'high');

    const firstSecret = secretLeaks[0];
    const firstCve = cves[0];

    const title = firstSecret
      ? `[SECURITY] Hardcoded ${firstSecret.ruleName} credential detected in ${firstSecret.file}`
      : `[SECURITY] High/Critical Vulnerability: ${firstCve?.packageName || 'Dependency CVE'}`;

    // Search for duplicate
    const match = existingIssues.find((issue) =>
      issue.title.toLowerCase().includes(firstSecret ? firstSecret.ruleName.toLowerCase() : firstCve?.packageName.toLowerCase() || '')
    );

    if (match) {
      return {
        action: 'update_issue',
        existingIssueId: match.id,
        existingIssueUrl: match.url,
        isDuplicate: true,
        confidence: 1.0,
        rationale: `Duplicate security finding already tracked in Linear (${match.identifier}).`,
      };
    }

    const description = this.formatSecurityIssueDescription(evidence, security);

    return {
      action: 'create_issue',
      isDuplicate: false,
      confidence: 1.0,
      rationale: 'Critical security violation or secret leak detected in pull request.',
      issuePayload: {
        title,
        description,
        teamKey,
        priority: 1, // Urgent / P0
        labels: ['security', 'ai-detected', 'vulnerability', 'p0-blocker'],
        prUrl: `https://github.com/${evidence.pr.owner}/${evidence.pr.repo}/pull/${evidence.pr.pullNumber}`,
        commitSha: evidence.pr.commitSha,
        severity: 'critical',
        confidence: 1.0,
        suggestedFix: firstSecret
          ? 'Immediately invalidate/revoke this token and replace with environment variable secret.'
          : `Upgrade ${firstCve?.packageName} to safe patched version ${firstCve?.patchedVersions || 'latest'}.`,
      },
    };
  }

  private findDuplicateIssue(
    testName: string,
    rootCause: string,
    existingIssues: LinearExistingIssueSummary[]
  ): LinearExistingIssueSummary | undefined {
    const cleanTest = testName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanRoot = rootCause.toLowerCase().slice(0, 40);

    return existingIssues.find((issue) => {
      const titleLower = issue.title.toLowerCase();
      if (cleanTest && titleLower.includes(cleanTest.slice(0, 15))) {
        return true;
      }
      if (cleanRoot && titleLower.includes(cleanRoot)) {
        return true;
      }
      return false;
    });
  }

  private formatFailureIssueDescription(
    evidence: PipelineEvidence,
    analysis: FailureAnalysisResult
  ): string {
    const firstFail = evidence.testResults?.failures?.[0];

    return `## Summary
${analysis.rootCauseSummary}

## Detection
Detected automatically by **SentinelFlow AI Quality Pipeline**.

## GitHub Context
- **Repository:** [${evidence.pr.owner}/${evidence.pr.repo}](https://github.com/${evidence.pr.owner}/${evidence.pr.repo})
- **Pull Request:** [#${evidence.pr.pullNumber} — ${evidence.pr.title}](https://github.com/${evidence.pr.owner}/${evidence.pr.repo}/pull/${evidence.pr.pullNumber})
- **Commit:** \`${evidence.pr.commitSha.slice(0, 8)}\`

## Failing Test & Evidence
- **Test:** \`${firstFail?.testName || 'Test Suite'}\`
- **Suite:** \`${firstFail?.suite || 'default'}\`
\`\`\`text
${firstFail?.errorMessage || 'Test assertion failed'}
\`\`\`

## AI Assessment
- **Classification:** \`${analysis.classification}\`
- **Confidence:** \`${(analysis.confidence * 100).toFixed(0)}%\`
- **Regression:** \`${analysis.isRegression ? 'Yes' : 'No'}\`
- **Rationale:** ${analysis.reason}

## Recommended Fix
${analysis.suggestedFix || 'Inspect the error stack trace and handle edge-cases.'}
`;
  }

  private formatSecurityIssueDescription(
    evidence: PipelineEvidence,
    security: SecurityScanResult
  ): string {
    return `## 🚨 Critical Security Alert
SentinelFlow AI detected a security violation in this pull request.

## GitHub Context
- **Pull Request:** [#${evidence.pr.pullNumber} — ${evidence.pr.title}](https://github.com/${evidence.pr.owner}/${evidence.pr.repo}/pull/${evidence.pr.pullNumber})
- **Commit:** \`${evidence.pr.commitSha.slice(0, 8)}\`

## Secret Leaks Detected
${
  security.secretLeaks.length > 0
    ? security.secretLeaks
        .map(
          (s) => `- **Rule:** \`${s.ruleName}\`\n  - **File:** \`${s.file}:${s.line || 'N/A'}\`\n  - **Masked Token:** \`${s.maskedSecret}\``
        )
        .join('\n')
    : 'None'
}

## Dependency Vulnerabilities
${
  security.vulnerabilities.length > 0
    ? security.vulnerabilities
        .map(
          (v) => `- **Package:** \`${v.packageName}\` (${v.severity.toUpperCase()})\n  - **Title:** ${v.title}\n  - **Patched:** \`${v.patchedVersions || 'Available'}\``
        )
        .join('\n')
    : 'None'
}

## Action Required
1. Invalidate any leaked credentials immediately.
2. Rotate tokens in production secret managers.
3. Remove raw tokens from git history before merging.
`;
  }
}
