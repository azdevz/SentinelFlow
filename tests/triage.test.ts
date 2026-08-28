/**
 * Unit tests for TriageEngine and Deduplication
 */

import { describe, it, expect } from 'vitest';
import { TriageEngine } from '../src/triage/dedup.js';
import { PipelineEvidence, FailureAnalysisResult } from '../src/types/index.js';

describe('TriageEngine', () => {
  const triage = new TriageEngine(0.9);

  const mockEvidence: PipelineEvidence = {
    pr: {
      owner: 'azdevz',
      repo: 'SentinelFlow',
      pullNumber: 42,
      commitSha: 'abcdef1234567890',
      title: 'Fix payment timeout',
      baseBranch: 'main',
      headBranch: 'fix/payment',
    },
    diff: '',
    changedFiles: ['src/payment.ts'],
    testResults: {
      passed: false,
      totalTests: 10,
      passedCount: 9,
      failedCount: 1,
      skippedCount: 0,
      durationMs: 500,
      failures: [
        {
          suite: 'test/payment.test.ts',
          testName: 'PaymentService > handles gateway timeout gracefully',
          errorMessage: 'Expected 504 got 500',
          filePath: 'src/payment.ts',
        },
      ],
    },
  };

  const highConfidenceFailure: FailureAnalysisResult = {
    classification: 'REAL_BUG',
    confidence: 0.95,
    reason: 'Payment timeout exception not handled in service layer.',
    rootCauseSummary: 'Removal of retry handler caused gateway timeout handling to fail',
    isRegression: true,
    suggestedFix: 'Wrap gateway call with timeout error handler',
    failingTest: 'PaymentService > handles gateway timeout gracefully',
  };

  it('creates new Linear ticket when no duplicate exists and confidence >= 0.9', () => {
    const decision = triage.evaluateFailure(mockEvidence, highConfidenceFailure, [], 'AK');
    expect(decision.action).toBe('create_issue');
    expect(decision.isDuplicate).toBe(false);
    expect(decision.issuePayload?.title).toContain('Removal of retry handler');
    expect(decision.issuePayload?.priority).toBe(1); // Urgent
  });

  it('detects duplicate via embedded fingerprint', () => {
    const fingerprint = triage.generateFingerprint('PaymentService > handles gateway timeout gracefully', 'src/payment.ts');
    const existingIssues = [
      {
        id: 'issue-1',
        identifier: 'AK-7',
        title: '[AI Bug] Payment gateway timeout regression',
        description: `<!-- sentinelflow-fingerprint: ${fingerprint} -->\nEarlier CI run description`,
        url: 'https://linear.app/ayaz-chishti/issue/AK-7',
      },
    ];

    const decision = triage.evaluateFailure(mockEvidence, highConfidenceFailure, existingIssues, 'AK');
    expect(decision.action).toBe('update_issue');
    expect(decision.isDuplicate).toBe(true);
    expect(decision.existingIssueId).toBe('issue-1');
  });

  it('detects duplicate via keyword overlap similarity even if title wording varies', () => {
    const existingIssues = [
      {
        id: 'issue-2',
        identifier: 'AK-8',
        title: '[AI] Gateway timeout handling failed due to retry logic removal',
        description: 'PaymentService test failure on payment processing timeout',
        url: 'https://linear.app/ayaz-chishti/issue/AK-8',
      },
    ];

    const decision = triage.evaluateFailure(mockEvidence, highConfidenceFailure, existingIssues, 'AK');
    expect(decision.action).toBe('update_issue');
    expect(decision.isDuplicate).toBe(true);
    expect(decision.existingIssueId).toBe('issue-2');
  });

  it('does not create Linear ticket if confidence is below threshold', () => {
    const lowConfidence: FailureAnalysisResult = {
      ...highConfidenceFailure,
      confidence: 0.65,
    };

    const decision = triage.evaluateFailure(mockEvidence, lowConfidence, [], 'AK');
    expect(decision.action).toBe('no_action');
    expect(decision.rationale).toContain('below auto-ticket threshold');
  });
});
