/**
 * Unit tests for SlackIntegration Block Kit message formatting
 */

import { describe, it, expect } from 'vitest';
import { SlackIntegration } from '../src/integrations/slack.js';
import { SlackNotificationPayload } from '../src/types/index.js';

describe('SlackIntegration', () => {
  const slack = new SlackIntegration();

  it('builds green Block Kit card for passed PR checks', () => {
    const payload: SlackNotificationPayload = {
      status: 'passed',
      prTitle: 'Add authentication middleware',
      prNumber: 101,
      prUrl: 'https://github.com/org/repo/pull/101',
      commitSha: '1234567890abcdef',
      summary: 'All 24 quality checks passed.',
      highConfidenceFindingsCount: 0,
      failedTestsCount: 0,
      securityIssuesCount: 0,
    };

    const message = slack.buildBlockKitMessage(payload);
    expect(message.blocks).toBeDefined();
    expect(message.blocks[0].text.text).toContain('Quality Checks Passed');
    expect(message.blocks[1].text.text).toContain('#101 — Add authentication middleware');
  });

  it('builds critical alert Block Kit card for security leaks', () => {
    const payload: SlackNotificationPayload = {
      status: 'security_alert',
      prTitle: 'Payment config updates',
      prNumber: 102,
      prUrl: 'https://github.com/org/repo/pull/102',
      commitSha: 'abcdef1234567890',
      summary: 'Hardcoded AWS credentials detected.',
      highConfidenceFindingsCount: 1,
      failedTestsCount: 0,
      securityIssuesCount: 1,
      linearIssueUrl: 'https://linear.app/workspace/issue/ENG-999',
      linearIssueIdentifier: 'ENG-999',
    };

    const message = slack.buildBlockKitMessage(payload);
    expect(message.blocks[0].text.text).toContain('CRITICAL SECURITY ALERT');
    expect(message.blocks[3].fields[3].text).toContain('ENG-999');
  });
});
