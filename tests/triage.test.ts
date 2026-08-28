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
          testName: 'PaymentService > handles timeout',
          errorMessage: 'Expected 504 got 500',
        },
      ],
    },
  };

  const highConfidenceFailure: FailureAnalysisResult = {
    classification: 'REAL_BUG',
    confidence: 0.95,
    reason: 'Payment timeout exception not handled in service layer.',
    rootCauseSummary: 'Checkout API returns 500 on payment timeout',
    isRegression: true,
    suggestedFix: 'Wrap gateway call with timeout error handler',
    failingTest: 'PaymentService > handles timeout',
  };

  it('creates new Linear ticket when no duplicate exists and confidence >= 0.9', () => {
    const decision = triage.evaluateFailure(mockEvidence, highConfidenceFailure, [], 'ENG');
    expect(decision.action).toBe('create_issue');
    expect(decision.isDuplicate).toBe(false);
    expect(decision.issuePayload?.title).toContain('Checkout API returns 500 on payment timeout');
    expect(decision.issuePayload?.priority).toBe(1); // Urgent
  });

  it('detects existing Linear ticket and updates instead of creating duplicate', () => {
    const existingIssues = [
      {
        id: 'issue-1',
        identifier: 'ENG-482',
        title: '[AI] Checkout API returns 500 on payment timeout',
        url: 'https://linear.app/team/issue/ENG-482',
      },
    ];

    const decision = triage.evaluateFailure(mockEvidence, highConfidenceFailure, existingIssues, 'ENG');
    expect(decision.action).toBe('update_issue');
    expect(decision.isDuplicate).toBe(true);
    expect(decision.existingIssueId).toBe('issue-1');
  });

  it('does not create Linear ticket if confidence is below threshold', () => {
    const lowConfidence: FailureAnalysisResult = {
      ...highConfidenceFailure,
      confidence: 0.65,
    };

    const decision = triage.evaluateFailure(mockEvidence, lowConfidence, [], 'ENG');
    expect(decision.action).toBe('no_action');
    expect(decision.rationale).toContain('below auto-ticket threshold');
  });
});
