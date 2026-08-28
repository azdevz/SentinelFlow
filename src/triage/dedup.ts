/**
 * SentinelFlow AI — Deduplication & Triage Engine
 * Prevents Linear issue spam by matching incoming failures against existing active tickets
 * using deterministic fingerprints, full-text description scanning, and keyword similarity.
 */

import {
  PipelineEvidence,
  FailureAnalysisResult,
  SecurityScanResult,
  TriageDecision,
  LinearIssuePayload,
} from '../types/index.js';

export interface LinearExistingIssueSummary {
  id: string;
  identifier: string; // e.g. AK-7
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
   * Decide triage action for CI test failure.
   */
  public evaluateFailure(
    evidence: PipelineEvidence,
    analysis: FailureAnalysisResult,
    existingIssues: LinearExistingIssueSummary[] = [],
    teamKey: string = 'AK'
  ): TriageDecision {
    // Check if confidence meets threshold
    if (analysis.confidence < this.autoTicketThreshold) {
      return {
        action: 'no_action',
        isDuplicate: false,
        confidence: analysis.confidence,
        rationale: `AI confidence (${(analysis.confidence * 100).toFixed(0)}%) is below auto-ticket threshold (${(this.autoTicketThreshold * 100).toFixed(0)}%). Finding flagged for PR review without creating Linear ticket.`,
      };
    }

    const firstFail = evidence.testResults?.failures?.[0];
    const testName = analysis.failingTest || firstFail?.testName || 'Test Suite';
    const filePath = firstFail?.filePath || evidence.changedFiles[0] || 'src/app';

    // Generate unique deterministic fingerprint
    const fingerprint = this.generateFingerprint(testName, filePath);

    // Search for duplicate issues
    const match = this.findDuplicateIssue(
      fingerprint,
      testName,
      filePath,
      analysis.rootCauseSummary,
      existingIssues
    );

    if (match) {
      return {
        action: 'update_issue',
        existingIssueId: match.id,
        existingIssueUrl: match.url,
        isDuplicate: true,
        confidence: analysis.confidence,
        rationale: `Existing active defect found in Linear (${match.identifier}: "${match.title}"). Updating existing ticket instead of creating duplicate.`,
      };
    }

    const issueTitle = `[AI Bug] ${analysis.rootCauseSummary.slice(0, 75)}`;
    const payload: LinearIssuePayload = {
      title: issueTitle,
      description: this.formatFailureIssueDescription(evidence, analysis, fingerprint),
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
      rationale: `New high-confidence defect detected (${(analysis.confidence * 100).toFixed(0)}%). No duplicate Linear issue found.`,
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
    teamKey: string = 'AK'
  ): TriageDecision | null {
    if (security.passed) {
      return null;
    }

    const secretLeaks = security.secretLeaks;
    const cves = security.vulnerabilities.filter((v) => v.severity === 'critical' || v.severity === 'high');

    const firstSecret = secretLeaks[0];
    const firstCve = cves[0];

    const ruleOrPkg = firstSecret ? firstSecret.ruleName : firstCve?.packageName || 'Dependency_CVE';
    const fingerprint = `sec-${ruleOrPkg.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

    // Search for duplicate security issue
    const match = existingIssues.find((issue) => {
      const fullText = `${issue.title} ${issue.description || ''}`.toLowerCase();
      return fullText.includes(fingerprint) || fullText.includes(ruleOrPkg.toLowerCase());
    });

    if (match) {
      return {
        action: 'update_issue',
        existingIssueId: match.id,
        existingIssueUrl: match.url,
        isDuplicate: true,
        confidence: 1.0,
        rationale: `Duplicate security issue already tracked in Linear (${match.identifier}).`,
      };
    }

    const title = firstSecret
      ? `[SECURITY] Hardcoded ${firstSecret.ruleName} credential detected in ${firstSecret.file}`
      : `[SECURITY] High/Critical Vulnerability: ${firstCve?.packageName || 'Dependency CVE'}`;

    const description = this.formatSecurityIssueDescription(evidence, security, fingerprint);

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

  /**
   * Multi-strategy duplicate search.
   */
  public findDuplicateIssue(
    fingerprint: string,
    testName: string,
    filePath: string,
    rootCause: string,
    existingIssues: LinearExistingIssueSummary[]
  ): LinearExistingIssueSummary | undefined {
    const cleanTestWords = this.tokenize(testName);
    const cleanRootWords = this.tokenize(rootCause);

    for (const issue of existingIssues) {
      const fullText = `${issue.title} ${issue.description || ''}`.toLowerCase();

      // Strategy 1: Exact Fingerprint Match
      if (fullText.includes(fingerprint.toLowerCase())) {
        return issue;
      }

      // Strategy 2: Test Name Exact Substring Match
      if (testName.length > 8 && fullText.includes(testName.toLowerCase())) {
        return issue;
      }

      // Strategy 3: Significant Keyword Overlap (Jaccard token similarity)
      const issueWords = this.tokenize(fullText);
      const testOverlap = this.calculateOverlap(cleanTestWords, issueWords);
      const rootOverlap = this.calculateOverlap(cleanRootWords, issueWords);

      if (testOverlap >= 0.6 || rootOverlap >= 0.55) {
        return issue;
      }
    }

    return undefined;
  }

  public generateFingerprint(testName: string, filePath: string): string {
    const cleanTest = testName.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 40);
    const cleanFile = filePath.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(-25);
    return `fp_${cleanFile}_${cleanTest}`;
  }

  private tokenize(text: string): Set<string> {
    const stopWords = new Set([
      'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'in', 'to', 'for', 'with', 'by',
      'test', 'suite', 'failing', 'failed', 'error', 'expected', 'actual', 'ai', 'bug', 'caused'
    ]);

    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

    return new Set(words);
  }

  private calculateOverlap(queryTokens: Set<string>, targetTokens: Set<string>): number {
    if (queryTokens.size === 0) return 0;
    let matchCount = 0;
    for (const token of queryTokens) {
      if (targetTokens.has(token)) {
        matchCount++;
      }
    }
    return matchCount / queryTokens.size;
  }

  private formatFailureIssueDescription(
    evidence: PipelineEvidence,
    analysis: FailureAnalysisResult,
    fingerprint: string
  ): string {
    const firstFail = evidence.testResults?.failures?.[0];

    return `<!-- sentinelflow-fingerprint: ${fingerprint} -->
## Summary
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
    security: SecurityScanResult,
    fingerprint: string
  ): string {
    return `<!-- sentinelflow-fingerprint: ${fingerprint} -->
## 🚨 Critical Security Alert
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

## Action Required
1. Invalidate any leaked credentials immediately.
2. Rotate tokens in production secret managers.
3. Remove raw tokens from git history before merging.
`;
  }
}
