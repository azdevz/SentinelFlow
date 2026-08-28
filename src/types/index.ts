/**
 * SentinelFlow AI — Core Domain Types and Schemas
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type Category = 
  | 'correctness'
  | 'security'
  | 'reliability'
  | 'maintainability'
  | 'testing'
  | 'secret_leak';

export type FailureClassification =
  | 'REAL_BUG'
  | 'REGRESSION'
  | 'TEST_DEFECT'
  | 'FLAKY_TEST'
  | 'INFRA_FAILURE'
  | 'DEPENDENCY_FAILURE'
  | 'SECURITY_VULNERABILITY'
  | 'CREDENTIAL_LEAK'
  | 'UNKNOWN';

export interface CodeFinding {
  id: string;
  severity: Severity;
  confidence: number; // 0.0 to 1.0
  category: Category;
  file: string;
  line?: number;
  title: string;
  description: string;
  evidence: string;
  recommendedFix?: string;
  requiresTicket: boolean;
}

export interface ReviewResult {
  status: 'passed' | 'changes_requested' | 'comment';
  summary: string;
  findings: CodeFinding[];
  analyzedFiles: string[];
}

export interface TestFailureItem {
  suite: string;
  testName: string;
  errorMessage: string;
  stackTrace?: string;
  durationMs?: number;
  filePath?: string;
}

export interface TestRunResult {
  passed: boolean;
  totalTests: number;
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  durationMs: number;
  failures: TestFailureItem[];
  rawOutput?: string;
}

export interface SecretLeakFinding {
  id: string;
  ruleName: string;
  description: string;
  file: string;
  line?: number;
  maskedSecret: string;
  severity: Severity;
}

export interface DependencyVulnerability {
  id: string;
  packageName: string;
  severity: Severity;
  title: string;
  cveOrAdvisoryUrl?: string;
  vulnerableVersions?: string;
  patchedVersions?: string;
  dependencyPath?: string;
}

export interface SecurityScanResult {
  passed: boolean;
  secretLeaks: SecretLeakFinding[];
  vulnerabilities: DependencyVulnerability[];
  summary: string;
}

export interface FailureAnalysisResult {
  classification: FailureClassification;
  confidence: number;
  reason: string;
  rootCauseSummary: string;
  isRegression: boolean;
  suggestedFix?: string;
  failingTest?: string;
}

export interface PRMetadata {
  owner: string;
  repo: string;
  pullNumber: number;
  commitSha: string;
  title: string;
  description?: string;
  author?: string;
  baseBranch: string;
  headBranch: string;
}

export interface PipelineEvidence {
  pr: PRMetadata;
  diff: string;
  changedFiles: string[];
  testResults?: TestRunResult;
  securityResults?: SecurityScanResult;
  linterErrors?: string[];
  typeErrors?: string[];
  ciLogs?: string;
}

export interface TriageDecision {
  action: 'create_issue' | 'update_issue' | 'no_action';
  existingIssueId?: string;
  existingIssueUrl?: string;
  isDuplicate: boolean;
  confidence: number;
  rationale: string;
  issuePayload?: LinearIssuePayload;
}

export interface LinearIssuePayload {
  title: string;
  description: string;
  teamKey: string;
  priority: number; // 0 (None), 1 (Urgent), 2 (High), 3 (Normal), 4 (Low)
  labels: string[];
  prUrl: string;
  commitSha: string;
  severity: Severity;
  confidence: number;
  suggestedFix?: string;
}

export interface SlackNotificationPayload {
  status: 'passed' | 'failed' | 'security_alert' | 'attention_required';
  prTitle: string;
  prNumber: number;
  prUrl: string;
  commitSha: string;
  summary: string;
  highConfidenceFindingsCount: number;
  failedTestsCount: number;
  securityIssuesCount: number;
  linearIssueUrl?: string;
  linearIssueIdentifier?: string;
  details?: Array<{ label: string; value: string }>;
}
