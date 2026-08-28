#!/usr/bin/env node
/**
 * SentinelFlow AI — Master CLI Orchestrator
 * Usage:
 *   sentinelflow                       # Runs in CI pipeline
 *   sentinelflow --simulate=pass       # Simulates green PR run
 *   sentinelflow --simulate=fail       # Simulates PR test failure + AI RCA + Linear ticket + Slack alert
 *   sentinelflow --simulate=security   # Simulates credential leak + Critical alert
 */

import 'dotenv/config';
import { SecurityScanner } from './security/scanner.js';
import { EvidenceCollector } from './collector/evidence.js';
import { AIAgent } from './ai/agent.js';
import { TriageEngine } from './triage/dedup.js';
import { LinearIntegration } from './integrations/linear.js';
import { SlackIntegration } from './integrations/slack.js';
import { GitHubIntegration } from './integrations/github.js';
import { PipelineEvidence, PRMetadata, TestRunResult, SecurityScanResult } from './types/index.js';

async function main() {
  const args = process.argv.slice(2);
  const simulateArg = args.find((a) => a.startsWith('--simulate='));
  const simulationMode = simulateArg ? simulateArg.split('=')[1] : undefined;

  console.log('\n======================================================');
  console.log('⚡ SentinelFlow AI — Quality & Reliability Orchestrator');
  console.log('======================================================\n');

  const scanner = new SecurityScanner();
  const collector = new EvidenceCollector(scanner);
  const aiAgent = new AIAgent();
  const triage = new TriageEngine(
    Number(process.env.SENTINELFLOW_AUTO_TICKET_THRESHOLD) || 0.9
  );
  const linear = new LinearIntegration();
  const slack = new SlackIntegration();
  const github = new GitHubIntegration();

  let evidence: PipelineEvidence;

  if (simulationMode) {
    console.log(`[Mode] Running in SIMULATION mode: "${simulationMode.toUpperCase()}"\n`);
    evidence = createSimulationEvidence(simulationMode, scanner, collector);
  } else {
    console.log('[Mode] Running in LIVE CI PIPELINE mode\n');
    evidence = await collectLiveCIEvidence(scanner, collector);
  }

  // 1. Execute Security Scan on raw diff/files
  console.log('🔒 Step 1: Running Security & Secret Scanner...');
  const securityScan = evidence.securityResults || scanner.evaluate(evidence.diff, undefined);
  if (!securityScan.passed) {
    console.log(`🚨 Security Scan Alert: Found ${securityScan.secretLeaks.length} leaked secrets!`);
  } else {
    console.log('✅ Security Scan clean: No exposed secrets detected.');
  }

  // 2. Execute AI Review
  console.log('\n🧠 Step 2: Running AI Code Review...');
  const reviewResult = await aiAgent.reviewPullRequest(evidence);
  console.log(`AI Review Status: ${reviewResult.status.toUpperCase()}`);
  console.log(`Findings: ${reviewResult.findings.length} item(s)`);

  // 3. Execute AI Failure RCA (if tests failed or security failed)
  let failureAnalysis;
  if (evidence.testResults && !evidence.testResults.passed) {
    console.log('\n🔍 Step 3: Running AI Test Failure Root Cause Analysis...');
    failureAnalysis = await aiAgent.analyzeFailure(evidence);
    console.log(`Failure Classification: ${failureAnalysis.classification} (Confidence: ${(failureAnalysis.confidence * 100).toFixed(0)}%)`);
    console.log(`Root Cause: ${failureAnalysis.rootCauseSummary}`);
  }

  // 4. Linear Triage & Deduplication
  console.log('\n📊 Step 4: Checking Linear for Deduplication & Issue Management...');
  let linearTicketUrl: string | undefined;
  let linearTicketId: string | undefined;

  const existingIssues = await linear.getActiveIssues();

  // Check security alerts first
  if (!securityScan.passed) {
    const secDecision = triage.evaluateSecurityAlert(evidence, securityScan, existingIssues, process.env.LINEAR_TEAM_KEY);
    if (secDecision && secDecision.action === 'create_issue' && secDecision.issuePayload) {
      console.log(`[Linear] Creating P0 Urgent Security Ticket: "${secDecision.issuePayload.title}"`);
      const created = await linear.createIssue(secDecision.issuePayload);
      linearTicketUrl = created.url;
      linearTicketId = created.identifier;
      console.log(`[Linear] Created Ticket ${created.identifier}: ${created.url}`);
    }
  } else if (failureAnalysis) {
    const triageDecision = triage.evaluateFailure(evidence, failureAnalysis, existingIssues, process.env.LINEAR_TEAM_KEY);
    console.log(`Triage Rationale: ${triageDecision.rationale}`);

    if (triageDecision.action === 'create_issue' && triageDecision.issuePayload) {
      console.log(`[Linear] Auto-creating Defect Ticket: "${triageDecision.issuePayload.title}"`);
      const created = await linear.createIssue(triageDecision.issuePayload);
      linearTicketUrl = created.url;
      linearTicketId = created.identifier;
      console.log(`[Linear] Created Ticket ${created.identifier}: ${created.url}`);
    } else if (triageDecision.action === 'update_issue' && triageDecision.existingIssueId) {
      console.log(`[Linear] Updating existing Ticket ${triageDecision.existingIssueUrl}`);
      await linear.addComment(
        triageDecision.existingIssueId,
        `SentinelFlow CI run on PR #${evidence.pr.pullNumber} (${evidence.pr.commitSha}) reproduced this failure.`
      );
      linearTicketUrl = triageDecision.existingIssueUrl;
    }
  }

  // 5. GitHub PR Comment
  console.log('\n🐙 Step 5: Updating GitHub Pull Request...');
  await github.postPRComment({
    pr: evidence.pr,
    review: reviewResult,
    failureAnalysis,
    security: securityScan,
    linearIssueUrl: linearTicketUrl,
    linearIssueIdentifier: linearTicketId,
  });

  // 6. Slack Notification
  console.log('\n💬 Step 6: Dispatching Slack Notification...');
  const isSecurityAlert = !securityScan.passed;
  const isTestFailed = evidence.testResults ? !evidence.testResults.passed : false;

  let slackStatus: 'passed' | 'failed' | 'security_alert' | 'attention_required' = 'passed';
  if (isSecurityAlert) {
    slackStatus = 'security_alert';
  } else if (isTestFailed) {
    slackStatus = 'failed';
  } else if (reviewResult.findings.some((f) => f.severity === 'high' || f.severity === 'critical')) {
    slackStatus = 'attention_required';
  }

  const slackDetails: Array<{ label: string; value: string }> = [];
  if (failureAnalysis) {
    slackDetails.push({ label: 'RCA Classification', value: `\`${failureAnalysis.classification}\` (${(failureAnalysis.confidence * 100).toFixed(0)}%)` });
    slackDetails.push({ label: 'Root Cause', value: failureAnalysis.rootCauseSummary });
  }
  if (securityScan.secretLeaks.length > 0) {
    slackDetails.push({ label: 'Leaked Credential', value: `\`${securityScan.secretLeaks[0].ruleName}\` in \`${securityScan.secretLeaks[0].file}\`` });
  }

  await slack.sendNotification({
    status: slackStatus,
    prTitle: evidence.pr.title,
    prNumber: evidence.pr.pullNumber,
    prUrl: `https://github.com/${evidence.pr.owner}/${evidence.pr.repo}/pull/${evidence.pr.pullNumber}`,
    commitSha: evidence.pr.commitSha,
    summary: isSecurityAlert
      ? '🚨 Hardcoded credentials detected in pull request. Immediate token revocation required.'
      : failureAnalysis
      ? `Automated test regression detected: ${failureAnalysis.rootCauseSummary}`
      : reviewResult.summary,
    highConfidenceFindingsCount: reviewResult.findings.filter((f) => f.confidence >= 0.9).length,
    failedTestsCount: evidence.testResults?.failedCount || 0,
    securityIssuesCount: securityScan.secretLeaks.length + securityScan.vulnerabilities.length,
    linearIssueUrl: linearTicketUrl,
    linearIssueIdentifier: linearTicketId,
    details: slackDetails,
  });

  console.log('\n🎉 SentinelFlow Quality Workflow Completed Successfully.\n');

  if (isSecurityAlert || isTestFailed) {
    console.log('⚠️ CI Check failed due to security alert or test failure. Blocking PR merge.');
    process.exit(1);
  }
}

function createSimulationEvidence(
  mode: string,
  scanner: SecurityScanner,
  collector: EvidenceCollector
): PipelineEvidence {
  const pr: PRMetadata = {
    owner: 'azdevz',
    repo: 'SentinelFlow',
    pullNumber: 184,
    commitSha: 'a7b3c9f82d1e0456789abcde1234567890abcdef',
    title: mode === 'pass'
      ? 'feat: Implement user authentication and JWT session validation'
      : mode === 'security'
      ? 'fix: Add hardcoded payment test credentials'
      : 'feat: Add checkout payment timeout retry handler',
    author: 'a.chishti',
    baseBranch: 'main',
    headBranch: 'feat/checkout-updates',
  };

  if (mode === 'pass') {
    const diff = `
diff --git a/src/auth.ts b/src/auth.ts
index 1234567..89abcdef 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,6 +10,14 @@ export function validateToken(token: string): boolean {
+  if (!token || typeof token !== 'string') {
+    return false;
+  }
+  return token.startsWith('Bearer ') && token.length > 10;
+}
`;
    const testResults: TestRunResult = {
      passed: true,
      totalTests: 12,
      passedCount: 12,
      failedCount: 0,
      skippedCount: 0,
      durationMs: 450,
      failures: [],
    };
    return collector.assembleEvidence({
      pr,
      diff,
      changedFiles: ['src/auth.ts'],
      testResults,
      securityResults: scanner.evaluate(diff),
    });
  }

  if (mode === 'security') {
    const diff = `
diff --git a/src/payment.ts b/src/payment.ts
index 1234567..89abcdef 100644
--- a/src/payment.ts
+++ b/src/payment.ts
@@ -5,6 +5,8 @@ export class PaymentClient {
+  // Accidental commit of production AWS credentials
+  private awsAccessKey = "AKIAIOSFODNN7EXAMPLE";
+  private awsSecret = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
`;
    return collector.assembleEvidence({
      pr,
      diff,
      changedFiles: ['src/payment.ts'],
      securityResults: scanner.evaluate(diff),
    });
  }

  // mode === 'fail' (Realistic test regression scenario)
  const diff = `
diff --git a/src/payment.ts b/src/payment.ts
index 1234567..89abcdef 100644
--- a/src/payment.ts
+++ b/src/payment.ts
@@ -25,7 +25,7 @@ export async function processPayment(req: PaymentRequest) {
-  return await gateway.chargeWithRetry(req);
+  // Refactored to direct call without retry handler
+  return await gateway.chargeDirect(req);
 }
`;

  const testResults: TestRunResult = {
    passed: false,
    totalTests: 15,
    passedCount: 14,
    failedCount: 1,
    skippedCount: 0,
    durationMs: 820,
    failures: [
      {
        suite: 'test/payment.test.ts',
        testName: 'PaymentService > handles gateway timeout gracefully',
        errorMessage: 'AssertionError: expected HTTP 500 to equal HTTP 504 Gateway Timeout\n    at PaymentService.test.ts:42:15\n    at processTicksAndRejections (node:internal/process/task_queues:95:5)',
        durationMs: 120,
        filePath: 'test/payment.test.ts',
      },
    ],
  };

  return collector.assembleEvidence({
    pr,
    diff,
    changedFiles: ['src/payment.ts'],
    testResults,
    securityResults: scanner.evaluate(diff),
  });
}

async function collectLiveCIEvidence(
  scanner: SecurityScanner,
  collector: EvidenceCollector
): Promise<PipelineEvidence> {
  const repoFull = process.env.GITHUB_REPOSITORY || 'owner/repo';
  const [owner, repo] = repoFull.split('/');
  const pullNumber = Number(process.env.GITHUB_PULL_REQUEST_NUMBER) || 1;
  const commitSha = process.env.GITHUB_COMMIT_SHA || 'HEAD';

  const pr: PRMetadata = {
    owner: owner || 'local',
    repo: repo || 'local-repo',
    pullNumber,
    commitSha,
    title: process.env.GITHUB_PR_TITLE || 'Pull Request Verification',
    baseBranch: process.env.GITHUB_BASE_REF || 'main',
    headBranch: process.env.GITHUB_HEAD_REF || 'feature',
  };

  return collector.assembleEvidence({
    pr,
    diff: '',
    changedFiles: [],
    testResults: {
      passed: true,
      totalTests: 0,
      passedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      durationMs: 0,
      failures: [],
    },
  });
}

main().catch((err) => {
  console.error('[SentinelFlow Fatal Error]', err);
  process.exit(1);
});
