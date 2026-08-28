/**
 * SentinelFlow AI — GitHub Integration Client
 * Inspects PR diffs, files, and posts automated review comments.
 */

import { Octokit } from '@octokit/rest';
import { PRMetadata, ReviewResult, FailureAnalysisResult, SecurityScanResult } from '../types/index.js';

export interface GitHubConfig {
  token?: string;
}

export class GitHubIntegration {
  private octokit?: Octokit;

  constructor(config?: GitHubConfig) {
    const token = config?.token || process.env.GITHUB_TOKEN;
    if (token) {
      this.octokit = new Octokit({ auth: token });
    }
  }

  public isConfigured(): boolean {
    return Boolean(this.octokit);
  }

  /**
   * Post or update a SentinelFlow summary comment on a GitHub Pull Request.
   */
  public async postPRComment(params: {
    pr: PRMetadata;
    review: ReviewResult;
    failureAnalysis?: FailureAnalysisResult;
    security?: SecurityScanResult;
    linearIssueUrl?: string;
    linearIssueIdentifier?: string;
  }): Promise<void> {
    const commentBody = this.buildCommentMarkdown(params);

    if (!this.octokit) {
      console.log('\n[SentinelFlow GitHub] (Simulation / Local Run — PR Comment Body)');
      console.log('===============================================================');
      console.log(commentBody);
      console.log('===============================================================\n');
      return;
    }

    try {
      // Find existing SentinelFlow comment to update instead of spamming new comments
      const existingComments = await this.octokit.issues.listComments({
        owner: params.pr.owner,
        repo: params.pr.repo,
        issue_number: params.pr.pullNumber,
      });

      const sentinelComment = existingComments.data.find((c) =>
        c.body?.includes('<!-- sentinelflow-report-marker -->')
      );

      if (sentinelComment) {
        await this.octokit.issues.updateComment({
          owner: params.pr.owner,
          repo: params.pr.repo,
          comment_id: sentinelComment.id,
          body: commentBody,
        });
        console.log(`[SentinelFlow GitHub] Updated existing comment #${sentinelComment.id}`);
      } else {
        await this.octokit.issues.createComment({
          owner: params.pr.owner,
          repo: params.pr.repo,
          issue_number: params.pr.pullNumber,
          body: commentBody,
        });
        console.log(`[SentinelFlow GitHub] Created new PR comment on #${params.pr.pullNumber}`);
      }
    } catch (err: any) {
      console.warn(`[SentinelFlow GitHub] Failed to post PR comment: ${err.message}`);
    }
  }

  private buildCommentMarkdown(params: {
    pr: PRMetadata;
    review: ReviewResult;
    failureAnalysis?: FailureAnalysisResult;
    security?: SecurityScanResult;
    linearIssueUrl?: string;
    linearIssueIdentifier?: string;
  }): string {
    const { review, failureAnalysis, security, linearIssueUrl, linearIssueIdentifier } = params;

    let badge = '![Passed](https://img.shields.io/badge/SentinelFlow-PASSED-success)';
    if (security && !security.passed) {
      badge = '![Security Alert](https://img.shields.io/badge/SentinelFlow-SECURITY_ALERT-critical)';
    } else if (failureAnalysis && failureAnalysis.classification !== 'UNKNOWN') {
      badge = '![Checks Failed](https://img.shields.io/badge/SentinelFlow-ACTION_REQUIRED-important)';
    }

    let markdown = `<!-- sentinelflow-report-marker -->
### ⚡ SentinelFlow AI Quality & Reliability Report

${badge}

**Commit:** \`${params.pr.commitSha.slice(0, 8)}\` | **Status:** ${review.status.toUpperCase()}

---

#### 📋 Executive Summary
${review.summary}

`;

    if (security && !security.passed) {
      markdown += `#### 🚨 Security & Secret Scan Findings
`;
      if (security.secretLeaks.length > 0) {
        markdown += `> **⚠️ Leaked Credentials Detected:**\n`;
        for (const secret of security.secretLeaks) {
          markdown += `- **${secret.ruleName}** in \`${secret.file}:${secret.line || 'N/A'}\` (Masked: \`${secret.maskedSecret}\`)\n`;
        }
      }
      if (security.vulnerabilities.length > 0) {
        markdown += `\n> **⚠️ High/Critical Dependency Vulnerabilities:**\n`;
        for (const vuln of security.vulnerabilities) {
          markdown += `- **${vuln.packageName}** (${vuln.severity.toUpperCase()}): ${vuln.title} (Patched in \`${vuln.patchedVersions || 'N/A'}\`)\n`;
        }
      }
      markdown += `\n`;
    }

    if (failureAnalysis && failureAnalysis.classification !== 'UNKNOWN') {
      markdown += `#### 🔍 Test Failure Root Cause Analysis (RCA)
- **Failing Test:** \`${failureAnalysis.failingTest || 'Test Suite'}\`
- **Classification:** \`${failureAnalysis.classification}\` (Confidence: ${(failureAnalysis.confidence * 100).toFixed(0)}%)
- **Root Cause:** ${failureAnalysis.rootCauseSummary}
- **Suggested Fix:**
\`\`\`text
${failureAnalysis.suggestedFix || 'Review test failure logs and adjust assertions.'}
\`\`\`

`;
    }

    if (review.findings.length > 0) {
      markdown += `#### 🛠️ AI Code Review Findings (${review.findings.length})
`;
      for (const finding of review.findings) {
        const sevEmoji = finding.severity === 'critical' || finding.severity === 'high' ? '🔴' : '🟡';
        markdown += `<details>
<summary>${sevEmoji} <b>[${finding.severity.toUpperCase()}] ${finding.title}</b> (<code>${finding.file}</code>)</summary>

- **Category:** \`${finding.category}\` (Confidence: ${(finding.confidence * 100).toFixed(0)}%)
- **Description:** ${finding.description}
- **Evidence:** \`${finding.evidence}\`
- **Recommendation:** ${finding.recommendedFix || 'N/A'}

</details>\n`;
      }
      markdown += `\n`;
    }

    if (linearIssueUrl) {
      markdown += `---
🔗 **Linear Defect Ticket:** [${linearIssueIdentifier || 'View in Linear'}](${linearIssueUrl})
`;
    }

    markdown += `\n<sub>*Automated by SentinelFlow AI — Deterministic checks find evidence. AI interprets evidence. Linear tracks work. Slack communicates it.*</sub>`;

    return markdown;
  }
}
