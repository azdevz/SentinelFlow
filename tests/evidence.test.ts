/**
 * Unit tests for EvidenceCollector
 */

import { describe, it, expect } from 'vitest';
import { EvidenceCollector } from '../src/collector/evidence.js';

describe('EvidenceCollector', () => {
  const collector = new EvidenceCollector();

  it('parses Vitest JSON test report and redacts secrets in failure messages', () => {
    const mockVitestReport = {
      numTotalTests: 5,
      numPassedTests: 4,
      numFailedTests: 1,
      testResults: [
        {
          name: 'test/auth.test.ts',
          assertionResults: [
            {
              title: 'validates JWT token correctly',
              status: 'failed',
              failureMessages: [
                'Error: Expected valid token but received secret AKIAIOSFODNN7EXAMPLE',
              ],
            },
          ],
        },
      ],
    };

    const result = collector.parseTestResults(mockVitestReport);
    expect(result.passed).toBe(false);
    expect(result.totalTests).toBe(5);
    expect(result.failedCount).toBe(1);
    expect(result.failures[0].errorMessage).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(result.failures[0].errorMessage).toContain('[REDACTED_SECRET:AWS_ACCESS_KEY_');
  });
});
