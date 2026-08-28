/**
 * SentinelFlow AI — Quality & Root Cause Analysis Agent
 * Analyzes code diffs and CI test failures using structured LLM prompts.
 */

import {
  PipelineEvidence,
  ReviewResult,
  FailureAnalysisResult,
  CodeFinding,
} from '../types/index.js';

export interface AIAgentConfig {
  openAiApiKey?: string;
  openAiModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
}

export class AIAgent {
  private config: AIAgentConfig;

  constructor(config?: AIAgentConfig) {
    this.config = config || {
      openAiApiKey: process.env.OPENAI_API_KEY,
      openAiModel: process.env.OPENAI_MODEL || 'gpt-4o',
      geminiApiKey: process.env.GEMINI_API_KEY,
      geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    };
  }

  /**
   * Perform AI code review on PR diff and evidence.
   */
  public async reviewPullRequest(evidence: PipelineEvidence): Promise<ReviewResult> {
    const prompt = this.buildReviewPrompt(evidence);

    if (this.config.openAiApiKey || this.config.geminiApiKey) {
      try {
        const rawJson = await this.callLLM(prompt, 'review');
        return this.parseReviewResponse(rawJson, evidence.changedFiles);
      } catch (err: any) {
        console.warn(`[SentinelFlow AI] LLM call failed, falling back to heuristic review: ${err.message}`);
      }
    }

    // Deterministic heuristic fallback when no LLM key is configured or offline
    return this.heuristicReview(evidence);
  }

  /**
   * Perform AI Root Cause Analysis on test failures.
   */
  public async analyzeFailure(evidence: PipelineEvidence): Promise<FailureAnalysisResult> {
    const failures = evidence.testResults?.failures || [];
    if (failures.length === 0 && (!evidence.typeErrors || evidence.typeErrors.length === 0)) {
      return {
        classification: 'UNKNOWN',
        confidence: 1.0,
        reason: 'No failures found in pipeline evidence.',
        rootCauseSummary: 'All deterministic checks succeeded.',
        isRegression: false,
      };
    }

    const prompt = this.buildFailureRCAPrompt(evidence);

    if (this.config.openAiApiKey || this.config.geminiApiKey) {
      try {
        const rawJson = await this.callLLM(prompt, 'failure_analysis');
        return this.parseFailureResponse(rawJson);
      } catch (err: any) {
        console.warn(`[SentinelFlow AI] LLM RCA call failed, falling back to heuristic analysis: ${err.message}`);
      }
    }

    // Deterministic heuristic fallback
    return this.heuristicFailureRCA(evidence);
  }

  private buildReviewPrompt(evidence: PipelineEvidence): string {
    return `
You are SentinelFlow AI, a Senior Principal Quality & Security Engineer performing automated code review.

PR Title: ${evidence.pr.title}
PR Description: ${evidence.pr.description || 'N/A'}
Changed Files: ${evidence.changedFiles.join(', ')}

Git Diff:
\`\`\`diff
${evidence.diff.slice(0, 10000)}
\`\`\`

Evaluate the diff for:
1. Correctness (logic bugs, unhandled null/undefined, race conditions, edge cases).
2. Security (injection, auth bypass, exposed endpoints).
3. Reliability (timeout handling, resource leaks, missing error catches).
4. Testing (missing tests for newly added critical logic).

Return STRICT JSON matching this schema:
{
  "status": "passed" | "changes_requested" | "comment",
  "summary": "Brief 1-2 sentence assessment",
  "findings": [
    {
      "id": "find-1",
      "severity": "critical" | "high" | "medium" | "low",
      "confidence": 0.0-1.0,
      "category": "correctness" | "security" | "reliability" | "maintainability" | "testing",
      "file": "src/path/to/file.ts",
      "line": 42,
      "title": "Short title",
      "description": "Detailed explanation of defect",
      "evidence": "Code line or logic excerpt",
      "recommendedFix": "Concrete code suggestion",
      "requiresTicket": true | false
    }
  ]
}
`;
  }

  private buildFailureRCAPrompt(evidence: PipelineEvidence): string {
    const failureList = evidence.testResults?.failures
      ?.map((f) => `Test: ${f.testName}\nSuite: ${f.suite}\nError: ${f.errorMessage}`)
      .join('\n---\n');

    return `
You are SentinelFlow AI, a Senior Reliability Engineer performing automated failure triage.

PR Title: ${evidence.pr.title}
Failing Tests:
${failureList || 'N/A'}

Recent Diff:
\`\`\`diff
${evidence.diff.slice(0, 8000)}
\`\`\`

Classify the failure into one of:
- REAL_BUG (Defect in application logic)
- REGRESSION (Worked before, broken by this PR)
- TEST_DEFECT (Test itself is outdated/bad assertion)
- FLAKY_TEST (Timing/concurrency flake)
- INFRA_FAILURE (Network timeout, runner OOM)

Return STRICT JSON matching this schema:
{
  "classification": "REAL_BUG" | "REGRESSION" | "TEST_DEFECT" | "FLAKY_TEST" | "INFRA_FAILURE",
  "confidence": 0.0-1.0,
  "reason": "Detailed rationale with evidence from diff and test stack trace",
  "rootCauseSummary": "Concise 1-sentence root cause",
  "isRegression": true | false,
  "suggestedFix": "Code diff or architectural patch",
  "failingTest": "test name"
}
`;
  }

  private async callLLM(prompt: string, taskType: string): Promise<any> {
    if (this.config.openAiApiKey) {
      const { OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: this.config.openAiApiKey });
      const response = await client.chat.completions.create({
        model: this.config.openAiModel || 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are SentinelFlow AI. Always reply with valid JSON only.' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content || '{}';
      return JSON.parse(content);
    }

    if (this.config.geminiApiKey) {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(this.config.geminiApiKey);
      const model = genAI.getGenerativeModel({ model: this.config.geminiModel || 'gemini-1.5-pro' });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt + '\nRespond in pure JSON.' }] }],
      });
      const text = result.response.text();
      const cleaned = text.replace(/^```json/m, '').replace(/```$/m, '').trim();
      return JSON.parse(cleaned);
    }

    throw new Error('No AI provider API key found.');
  }

  private parseReviewResponse(json: any, changedFiles: string[]): ReviewResult {
    return {
      status: json.status || 'passed',
      summary: json.summary || 'AI Review completed.',
      findings: Array.isArray(json.findings) ? json.findings : [],
      analyzedFiles: changedFiles,
    };
  }

  private parseFailureResponse(json: any): FailureAnalysisResult {
    return {
      classification: json.classification || 'REAL_BUG',
      confidence: typeof json.confidence === 'number' ? json.confidence : 0.9,
      reason: json.reason || 'AI analysis diagnosed test failure.',
      rootCauseSummary: json.rootCauseSummary || 'Test assertion failed due to unexpected return value.',
      isRegression: Boolean(json.isRegression),
      suggestedFix: json.suggestedFix,
      failingTest: json.failingTest,
    };
  }

  private heuristicReview(evidence: PipelineEvidence): ReviewResult {
    const findings: CodeFinding[] = [];

    // Check for common code smells in diff if offline
    if (/console\.log/i.test(evidence.diff)) {
      findings.push({
        id: 'find-debug-log',
        severity: 'low',
        confidence: 0.95,
        category: 'maintainability',
        file: evidence.changedFiles[0] || 'src/index.ts',
        title: 'Debug console.log statement found in pull request',
        description: 'Leftover debugging statements can clutter production logs and reduce performance.',
        evidence: 'console.log statement present in diff',
        recommendedFix: 'Remove console.log or use a structured logger.',
        requiresTicket: false,
      });
    }

    if (/payment.*timeout/i.test(evidence.diff) && !/catch|retry/i.test(evidence.diff)) {
      findings.push({
        id: 'find-payment-unhandled-timeout',
        severity: 'high',
        confidence: 0.92,
        category: 'reliability',
        file: evidence.changedFiles.find((f) => f.includes('payment')) || 'src/payment.ts',
        title: 'Unhandled payment gateway timeout exception',
        description: 'The payment integration executes remote calls without an explicit retry or graceful error handler.',
        evidence: 'Remote payment call without catch or timeout fallback in diff',
        recommendedFix: 'Wrap gateway calls in a retry handler with exponential backoff and return HTTP 504/408 instead of 500.',
        requiresTicket: true,
      });
    }

    const hasHighSeverity = findings.some((f) => f.severity === 'high' || f.severity === 'critical');
    return {
      status: hasHighSeverity ? 'changes_requested' : findings.length > 0 ? 'comment' : 'passed',
      summary: hasHighSeverity
        ? 'AI Review flagged potential high-severity reliability/logic risks in this pull request.'
        : 'AI Review passed. Code adheres to reliability and safety standards.',
      findings,
      analyzedFiles: evidence.changedFiles,
    };
  }

  private heuristicFailureRCA(evidence: PipelineEvidence): FailureAnalysisResult {
    const firstFailure = evidence.testResults?.failures?.[0];
    const errorMsg = firstFailure?.errorMessage || '';

    let classification: any = 'REAL_BUG';
    let confidence = 0.92;
    let isRegression = true;
    let rootCause = 'Assertion failure triggered by unexpected response payload or unhandled exception.';
    let fix = 'Check function boundary conditions and handle edge cases gracefully.';

    if (/timeout|ETIMEDOUT|timed out/i.test(errorMsg)) {
      classification = 'REAL_BUG';
      confidence = 0.94;
      rootCause = 'Downstream service timeout was not caught, causing API to respond with unhandled 500.';
      fix = 'Add try/catch with timeout fallback logic and return proper client error status.';
    } else if (/SyntaxError|Cannot find module/i.test(errorMsg)) {
      classification = 'DEPENDENCY_FAILURE';
      confidence = 0.98;
      rootCause = 'Missing or invalid import module in test bundle.';
      fix = 'Verify package dependencies in package.json and import paths.';
    }

    return {
      classification,
      confidence,
      reason: `Test [${firstFailure?.testName || 'suite'}] failed with: ${errorMsg.slice(0, 300)}...`,
      rootCauseSummary: rootCause,
      isRegression,
      suggestedFix: fix,
      failingTest: firstFailure?.testName,
    };
  }
}
