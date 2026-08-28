/**
 * SentinelFlow AI — Security & Secret Scanner
 * Detects hardcoded credentials, sensitive tokens, and audits dependency CVEs.
 */

import { SecretLeakFinding, DependencyVulnerability, SecurityScanResult, Severity } from '../types/index.js';

interface SecretRule {
  name: string;
  pattern: RegExp;
  description: string;
  severity: Severity;
}

// Industry-standard detection patterns for sensitive tokens and credentials
const SECRET_RULES: SecretRule[] = [
  {
    name: 'AWS_ACCESS_KEY',
    pattern: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g,
    description: 'Hardcoded AWS Access Key ID detected',
    severity: 'critical',
  },
  {
    name: 'AWS_SECRET_KEY',
    pattern: /(?:aws_secret_access_key|aws_sec_key|aws_secret)\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})["']?/gi,
    description: 'Hardcoded AWS Secret Access Key detected',
    severity: 'critical',
  },
  {
    name: 'GITHUB_PAT',
    pattern: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,255}/g,
    description: 'GitHub Personal Access Token or OAuth Token detected',
    severity: 'critical',
  },
  {
    name: 'SLACK_TOKEN',
    pattern: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*/g,
    description: 'Slack Bot or User API Token detected',
    severity: 'high',
  },
  {
    name: 'SLACK_WEBHOOK',
    pattern: /https:\/\/hooks\.slack\.com\/services\/T[a-zA-Z0-9_]+\/B[a-zA-Z0-9_]+\/[a-zA-Z0-9_]+/g,
    description: 'Hardcoded Slack Incoming Webhook URL detected',
    severity: 'high',
  },
  {
    name: 'OPENAI_KEY',
    pattern: /sk-[a-zA-Z0-9]{20}T3BlbkFJ[a-zA-Z0-9]{20}|sk-proj-[a-zA-Z0-9-_]{48,}/g,
    description: 'OpenAI API Secret Key detected',
    severity: 'high',
  },
  {
    name: 'RSA_PRIVATE_KEY',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
    description: 'Unencrypted Private Key header detected',
    severity: 'critical',
  },
  {
    name: 'GENERIC_API_KEY_OR_SECRET',
    pattern: /(?:api_key|apikey|secret_key|private_token|auth_token)\s*[:=]\s*["']([A-Za-z0-9_\-]{24,})["']/gi,
    description: 'High-entropy generic API key or secret token detected',
    severity: 'medium',
  },
  {
    name: 'DATABASE_URI_WITH_PASSWORD',
    pattern: /(?:postgres|postgresql|mysql|mongodb|redis):\/\/[a-zA-Z0-9_]+:([^@\s]+)@[a-zA-Z0-9.-]+:[0-9]+/gi,
    description: 'Database connection URI containing plaintext credentials',
    severity: 'critical',
  },
];

export class SecurityScanner {
  /**
   * Scan text content (diff or source files) for exposed secrets.
   */
  public scanForSecrets(content: string, filename: string = 'unknown'): SecretLeakFinding[] {
    const findings: SecretLeakFinding[] = [];

    const lines = content.split('\n');
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];

      for (const rule of SECRET_RULES) {
        // Reset RegExp state for global regexes
        rule.pattern.lastIndex = 0;
        const matches = line.matchAll(rule.pattern);

        for (const match of matches) {
          const rawMatch = match[0];
          const masked = this.maskSecret(rawMatch);

          findings.push({
            id: `sec-${rule.name.toLowerCase()}-${filename}-${lineIndex + 1}`,
            ruleName: rule.name,
            description: rule.description,
            file: filename,
            line: lineIndex + 1,
            maskedSecret: masked,
            severity: rule.severity,
          });
        }
      }
    }

    return findings;
  }

  /**
   * Mask secret characters, leaving only a short non-identifying hint.
   */
  public maskSecret(secret: string): string {
    if (secret.length <= 8) {
      return '****' + secret.slice(-2);
    }
    return secret.slice(0, 3) + '...' + '*'.repeat(8) + '...' + secret.slice(-3);
  }

  /**
   * Redact all discovered secrets from text to prevent leaking them to AI or logs.
   */
  public redactSecrets(content: string): string {
    let redacted = content;
    for (const rule of SECRET_RULES) {
      rule.pattern.lastIndex = 0;
      redacted = redacted.replace(rule.pattern, (match) => {
        return `[REDACTED_SECRET:${rule.name}_${this.maskSecret(match)}]`;
      });
    }
    return redacted;
  }

  /**
   * Parse npm audit JSON output to extract dependency vulnerabilities.
   */
  public parseNpmAudit(auditJson: any): DependencyVulnerability[] {
    const vulnerabilities: DependencyVulnerability[] = [];

    if (!auditJson || typeof auditJson !== 'object') {
      return vulnerabilities;
    }

    // npm v7+ audit format
    if (auditJson.vulnerabilities) {
      for (const [pkgName, details] of Object.entries<any>(auditJson.vulnerabilities)) {
        const severity: Severity = this.normalizeSeverity(details.severity);
        const via = Array.isArray(details.via) ? details.via : [];

        for (const advisory of via) {
          if (typeof advisory === 'object' && advisory !== null) {
            vulnerabilities.push({
              id: advisory.source ? String(advisory.source) : `cve-${pkgName}`,
              packageName: pkgName,
              severity: this.normalizeSeverity(advisory.severity || severity),
              title: advisory.title || `Vulnerability in ${pkgName}`,
              cveOrAdvisoryUrl: advisory.url || advisory.source ? `https://github.com/advisories/GHSA-${advisory.source}` : undefined,
              vulnerableVersions: advisory.range || details.range,
              patchedVersions: details.fixAvailable ? (typeof details.fixAvailable === 'object' ? details.fixAvailable.version : 'Available') : undefined,
              dependencyPath: details.nodes ? details.nodes.join(' > ') : undefined,
            });
          }
        }
      }
    }

    return vulnerabilities;
  }

  /**
   * Execute full security assessment.
   */
  public evaluate(
    diff: string,
    auditJson?: any,
    filesContent?: Record<string, string>
  ): SecurityScanResult {
    const secretLeaks: SecretLeakFinding[] = [];

    // Scan the git diff
    secretLeaks.push(...this.scanForSecrets(diff, 'git-diff'));

    // Scan any provided source files
    if (filesContent) {
      for (const [filepath, content] of Object.entries(filesContent)) {
        secretLeaks.push(...this.scanForSecrets(content, filepath));
      }
    }

    // Scan dependencies
    const vulnerabilities = auditJson ? this.parseNpmAudit(auditJson) : [];

    const hasCriticalOrHighSecrets = secretLeaks.some((s) => s.severity === 'critical' || s.severity === 'high');
    const hasCriticalOrHighCVEs = vulnerabilities.some((v) => v.severity === 'critical' || v.severity === 'high');

    const passed = !hasCriticalOrHighSecrets && !hasCriticalOrHighCVEs;

    const summary = passed
      ? `Security scan clean. 0 critical/high secret leaks, ${vulnerabilities.length} low-risk advisories.`
      : `SECURITY ALERT: Detected ${secretLeaks.length} secret leaks and ${vulnerabilities.length} dependency vulnerabilities.`;

    return {
      passed,
      secretLeaks,
      vulnerabilities,
      summary,
    };
  }

  private normalizeSeverity(sev?: string): Severity {
    const s = String(sev).toLowerCase();
    if (s === 'critical') return 'critical';
    if (s === 'high') return 'high';
    if (s === 'moderate' || s === 'medium') return 'medium';
    return 'low';
  }
}
