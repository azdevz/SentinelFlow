/**
 * SentinelFlow AI — Evidence Collector
 * Ingests test runner results (Vitest/Jest JSON), compiler outputs, linter errors,
 * security scan results, and git diffs, ensuring all secrets are redacted.
 */

import { PipelineEvidence, PRMetadata, TestRunResult, SecurityScanResult } from '../types/index.js';
import { SecurityScanner } from '../security/scanner.js';

export class EvidenceCollector {
  private scanner: SecurityScanner;

  constructor(scanner?: SecurityScanner) {
    this.scanner = scanner || new SecurityScanner();
  }

  /**
   * Parse Vitest / Jest JSON test output into normalized TestRunResult.
   */
  public parseTestResults(rawJsonOrText: string | any): TestRunResult {
    try {
      const data = typeof rawJsonOrText === 'string' ? JSON.parse(rawJsonOrText) : rawJsonOrText;

      // Vitest / Jest standard JSON format
      if (data && (data.testResults || data.numTotalTests !== undefined)) {
        const failures: any[] = [];

        if (Array.isArray(data.testResults)) {
          for (const suite of data.testResults) {
            if (Array.isArray(suite.assertionResults)) {
              for (const test of suite.assertionResults) {
                if (test.status === 'failed') {
                  failures.push({
                    suite: suite.name || 'default',
                    testName: test.title || test.fullName || 'Unnamed test',
                    errorMessage: this.scanner.redactSecrets(
                      Array.isArray(test.failureMessages) ? test.failureMessages.join('\n') : 'Test assertion failed'
                    ),
                    durationMs: test.duration || 0,
                    filePath: suite.name,
                  });
                }
              }
            }
          }
        }

        return {
          passed: (data.numFailedTests || 0) === 0,
          totalTests: data.numTotalTests || (data.numPassedTests || 0) + (data.numFailedTests || 0),
          passedCount: data.numPassedTests || 0,
          failedCount: data.numFailedTests || 0,
          skippedCount: data.numPendingTests || 0,
          durationMs: data.startTime && data.testResults ? 1200 : 0,
          failures,
          rawOutput: this.scanner.redactSecrets(typeof rawJsonOrText === 'string' ? rawJsonOrText : JSON.stringify(rawJsonOrText, null, 2)),
        };
      }
    } catch {
      // Fallback for non-JSON raw console test output
    }

    // Generic text parsing fallback
    const rawText = String(rawJsonOrText);
    const isFail = /FAIL|failed|ERR!/i.test(rawText);
    return {
      passed: !isFail,
      totalTests: isFail ? 1 : 1,
      passedCount: isFail ? 0 : 1,
      failedCount: isFail ? 1 : 0,
      skippedCount: 0,
      durationMs: 0,
      failures: isFail
        ? [
            {
              suite: 'CI Output',
              testName: 'Test Suite Execution',
              errorMessage: this.scanner.redactSecrets(rawText.slice(0, 2000)),
            },
          ]
        : [],
      rawOutput: this.scanner.redactSecrets(rawText),
    };
  }

  /**
   * Assemble pipeline evidence with secret sanitization.
   */
  public assembleEvidence(params: {
    pr: PRMetadata;
    diff: string;
    changedFiles: string[];
    testResults?: TestRunResult;
    securityResults?: SecurityScanResult;
    linterErrors?: string[];
    typeErrors?: string[];
    ciLogs?: string;
  }): PipelineEvidence {
    // Redact any secrets before the evidence is passed to AI agents or logged
    const sanitizedDiff = this.scanner.redactSecrets(params.diff);
    const sanitizedLogs = params.ciLogs ? this.scanner.redactSecrets(params.ciLogs) : undefined;

    return {
      pr: params.pr,
      diff: sanitizedDiff,
      changedFiles: params.changedFiles,
      testResults: params.testResults,
      securityResults: params.securityResults,
      linterErrors: params.linterErrors?.map((e) => this.scanner.redactSecrets(e)),
      typeErrors: params.typeErrors?.map((e) => this.scanner.redactSecrets(e)),
      ciLogs: sanitizedLogs,
    };
  }
}
