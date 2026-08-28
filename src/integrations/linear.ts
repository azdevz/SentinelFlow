/**
 * SentinelFlow AI — Linear Integration Client
 * Creates and updates Linear issues with AI failure and security findings.
 */

import { LinearClient } from '@linear/sdk';
import { LinearIssuePayload } from '../types/index.js';
import { LinearExistingIssueSummary } from '../triage/dedup.js';

export interface LinearConfig {
  apiKey?: string;
  teamKey?: string;
}

export class LinearIntegration {
  private client?: LinearClient;
  private teamKey: string;

  constructor(config?: LinearConfig) {
    const apiKey = config?.apiKey || process.env.LINEAR_API_KEY;
    this.teamKey = config?.teamKey || process.env.LINEAR_TEAM_KEY || 'ENG';

    if (apiKey) {
      this.client = new LinearClient({ apiKey });
    }
  }

  public isConfigured(): boolean {
    return Boolean(this.client);
  }

  /**
   * Fetch active issues for duplicate search.
   */
  public async getActiveIssues(): Promise<LinearExistingIssueSummary[]> {
    if (!this.client) {
      return [];
    }

    try {
      const teams = await this.client.teams();
      const targetTeam = teams.nodes.find((t) => t.key.toUpperCase() === this.teamKey.toUpperCase()) || teams.nodes[0];

      if (!targetTeam) {
        return [];
      }

      const issues = await this.client.issues({
        filter: {
          team: { id: { eq: targetTeam.id } },
          state: { type: { nin: ['completed', 'canceled'] } },
        },
        first: 50,
      });

      return issues.nodes.map((issue) => ({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description,
        url: issue.url,
      }));
    } catch (err: any) {
      console.warn(`[SentinelFlow Linear] Error fetching active issues: ${err.message}`);
      return [];
    }
  }

  /**
   * Create a new defect or security issue in Linear.
   */
  public async createIssue(payload: LinearIssuePayload): Promise<{ id: string; identifier: string; url: string }> {
    if (!this.client) {
      // Mock result when running offline or in simulation
      const mockId = `mock-${Date.now().toString(36)}`;
      const mockIdentifier = `${this.teamKey}-${Math.floor(100 + Math.random() * 900)}`;
      return {
        id: mockId,
        identifier: mockIdentifier,
        url: `https://linear.app/workspace/issue/${mockIdentifier}`,
      };
    }

    const teams = await this.client.teams();
    const targetTeam = teams.nodes.find((t) => t.key.toUpperCase() === this.teamKey.toUpperCase()) || teams.nodes[0];

    if (!targetTeam) {
      throw new Error(`Linear team with key "${this.teamKey}" not found.`);
    }

    const response = await this.client.createIssue({
      teamId: targetTeam.id,
      title: payload.title,
      description: payload.description,
      priority: payload.priority,
    });

    const issue = await response.issue;
    if (!issue) {
      throw new Error('Failed to retrieve created Linear issue.');
    }

    return {
      id: issue.id,
      identifier: issue.identifier,
      url: issue.url,
    };
  }

  /**
   * Append a new CI run comment to an existing Linear issue.
   */
  public async addComment(issueId: string, commentBody: string): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      await this.client.createComment({
        issueId,
        body: commentBody,
      });
    } catch (err: any) {
      console.warn(`[SentinelFlow Linear] Failed to add comment to issue ${issueId}: ${err.message}`);
    }
  }
}
