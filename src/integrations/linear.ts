/**
 * SentinelFlow AI — Linear Integration Client
 * Creates and updates Linear issues with:
 * - Direct placement into team's "Backlog" state
 * - "Bug" / "Security" label assignment
 * - Ticket Ownership / Assignee assignment (authenticated user / viewer)
 * - Project assignment (matching LINEAR_PROJECT_NAME or default team project)
 */

import { LinearClient } from '@linear/sdk';
import { LinearIssuePayload } from '../types/index.js';
import { LinearExistingIssueSummary } from '../triage/dedup.js';

export interface LinearConfig {
  apiKey?: string;
  teamKey?: string;
  projectName?: string;
}

export class LinearIntegration {
  private client?: LinearClient;
  private teamKey: string;
  private projectName?: string;

  constructor(config?: LinearConfig) {
    const apiKey = config?.apiKey || process.env.LINEAR_API_KEY;
    this.teamKey = config?.teamKey || process.env.LINEAR_TEAM_KEY || 'AK';
    this.projectName = config?.projectName || process.env.LINEAR_PROJECT_NAME || 'SentinelFlow';

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
      const targetTeam =
        teams.nodes.find((t) => t.key.toUpperCase() === this.teamKey.toUpperCase()) || teams.nodes[0];

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
   * Create a new defect or security issue in Linear with Project, Bug Label, Assignee, and Backlog state.
   */
  public async createIssue(payload: LinearIssuePayload): Promise<{ id: string; identifier: string; url: string }> {
    if (!this.client) {
      const mockId = `mock-${Date.now().toString(36)}`;
      const mockIdentifier = `${this.teamKey}-${Math.floor(100 + Math.random() * 900)}`;
      return {
        id: mockId,
        identifier: mockIdentifier,
        url: `https://linear.app/workspace/issue/${mockIdentifier}`,
      };
    }

    const teams = await this.client.teams();
    const targetTeam =
      teams.nodes.find((t) => t.key.toUpperCase() === this.teamKey.toUpperCase()) || teams.nodes[0];

    if (!targetTeam) {
      throw new Error(`Linear team with key "${this.teamKey}" not found.`);
    }

    // 1. Resolve State: Find "Backlog" state for the team
    let stateId: string | undefined;
    try {
      const states = await targetTeam.states();
      const backlogState =
        states.nodes.find((s) => s.type === 'backlog' || s.name.toLowerCase() === 'backlog') ||
        states.nodes.find((s) => s.type === 'unstarted');
      if (backlogState) {
        stateId = backlogState.id;
      }
    } catch (err: any) {
      console.warn(`[SentinelFlow Linear] Could not query team states: ${err.message}`);
    }

    // 2. Resolve Ownership: Get Authenticated User (Viewer) as Assignee
    let assigneeId: string | undefined;
    try {
      const viewer = await this.client.viewer;
      if (viewer && viewer.id) {
        assigneeId = viewer.id;
      }
    } catch (err: any) {
      console.warn(`[SentinelFlow Linear] Could not query viewer for assignment: ${err.message}`);
    }

    // 3. Resolve Project: Find matching project by name
    let projectId: string | undefined;
    try {
      const projects = await targetTeam.projects();
      const targetProj =
        projects.nodes.find((p) => p.name.toLowerCase().includes(this.projectName?.toLowerCase() || 'sentinelflow')) ||
        projects.nodes[0];
      if (targetProj) {
        projectId = targetProj.id;
      }
    } catch (err: any) {
      console.warn(`[SentinelFlow Linear] Could not query projects: ${err.message}`);
    }

    // 4. Resolve Labels: Find or assign "Bug", "security", "ai-detected"
    const labelIds: string[] = [];
    try {
      const teamLabels = await targetTeam.labels();
      const desiredLabels = payload.labels || ['bug', 'ai-detected'];

      for (const desired of desiredLabels) {
        const found = teamLabels.nodes.find(
          (l) => l.name.toLowerCase() === desired.toLowerCase()
        );
        if (found) {
          labelIds.push(found.id);
        }
      }
    } catch (err: any) {
      console.warn(`[SentinelFlow Linear] Could not query labels: ${err.message}`);
    }

    // 5. Create Issue with full metadata
    const createParams: any = {
      teamId: targetTeam.id,
      title: payload.title,
      description: payload.description,
      priority: payload.priority,
    };

    if (stateId) createParams.stateId = stateId;
    if (assigneeId) createParams.assigneeId = assigneeId;
    if (projectId) createParams.projectId = projectId;
    if (labelIds.length > 0) createParams.labelIds = labelIds;

    const response = await this.client.createIssue(createParams);
    const issue = await response.issue;

    if (!issue) {
      throw new Error('Failed to retrieve created Linear issue.');
    }

    console.log(
      `[SentinelFlow Linear] Created Issue ${issue.identifier} in Backlog (Project: ${projectId ? 'Assigned' : 'None'}, Assignee: ${assigneeId ? 'Assigned' : 'None'}, Labels: ${labelIds.length})`
    );

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
