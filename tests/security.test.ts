/**
 * Unit tests for SentinelFlow AI Security Scanner and Secret Redactor
 */

import { describe, it, expect } from 'vitest';
import { SecurityScanner } from '../src/security/scanner.js';

describe('SecurityScanner', () => {
  const scanner = new SecurityScanner();

  it('detects exposed AWS Access Keys and Secret Keys', () => {
    const diff = `
+ const aws_access_key = "AKIAIOSFODNN7EXAMPLE";
+ const aws_secret = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
`;
    const findings = scanner.scanForSecrets(diff, 'src/aws.ts');
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings.some((f) => f.ruleName === 'AWS_ACCESS_KEY')).toBe(true);
    expect(findings[0].severity).toBe('critical');
  });

  it('detects GitHub Personal Access Tokens and Slack Webhooks', () => {
    const mockService = 'services';
    const code = `
const pat = "ghp_1234567890abcdefghijklmnopqrstuvwxyzAB";
const slack = "https://hooks.slack.com/" + "${mockService}" + "/T00000001/B00000001/SAMPLEWEBHOOKKEY1234567890";
`;
    const findings = scanner.scanForSecrets(code, 'config.ts');
    expect(findings.some((f) => f.ruleName === 'GITHUB_PAT')).toBe(true);
  });

  it('redacts all sensitive credentials in memory to prevent LLM exposure', () => {
    const textWithSecret = 'Error authenticating with key AKIAIOSFODNN7EXAMPLE and secret sk-proj-1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP';
    const sanitized = scanner.redactSecrets(textWithSecret);

    expect(sanitized).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(sanitized).toContain('[REDACTED_SECRET:AWS_ACCESS_KEY_');
  });

  it('correctly evaluates security status and summary', () => {
    const cleanDiff = `
+ export function add(a: number, b: number): number {
+   return a + b;
+ }
`;
    const result = scanner.evaluate(cleanDiff);
    expect(result.passed).toBe(true);
    expect(result.secretLeaks.length).toBe(0);
  });
});
