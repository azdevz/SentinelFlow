/**
 * SentinelFlow AI — Slack Notification Dispatcher
 * Sends Block Kit visual notifications for PR status, defects, and security alerts.
 */

import { IncomingWebhook } from '@slack/webhook';
import { SlackNotificationPayload } from '../types/index.js';

export interface SlackConfig {
  webhookUrl?: string;
}

export class SlackIntegration {
  private webhook?: IncomingWebhook;

  constructor(config?: SlackConfig) {
    const url = config?.webhookUrl || process.env.SLACK_WEBHOOK_URL;
    if (url) {
      this.webhook = new IncomingWebhook(url);
    }
  }

  public isConfigured(): boolean {
    return Boolean(this.webhook);
  }

  /**
   * Build Block Kit message payload based on event status.
   */
  public buildBlockKitMessage(payload: SlackNotificationPayload): any {
    const { status, prTitle, prNumber, prUrl, commitSha, summary, linearIssueUrl, linearIssueIdentifier } = payload;

    let headerText = 'SentinelFlow Quality Notification';
    let statusEmoji = 'ℹ️';

    if (status === 'passed') {
      headerText = '✅ SentinelFlow: Quality Checks Passed';
      statusEmoji = '🟢';
    } else if (status === 'security_alert') {
      headerText = '🚨 SentinelFlow: CRITICAL SECURITY ALERT';
      statusEmoji = '🔴';
    } else if (status === 'failed' || status === 'attention_required') {
      headerText = '⚠️ SentinelFlow: Action Required on PR';
      statusEmoji = '🟠';
    }

    const blocks: any[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: headerText,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Pull Request:* <${prUrl}|#${prNumber} — ${prTitle}>\n*Commit:* \`${commitSha.slice(0, 8)}\`\n*Status:* ${statusEmoji} *${status.toUpperCase()}*`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `> *Summary:*\n> ${summary}`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Failed Tests:*\n\`${payload.failedTestsCount}\``,
          },
          {
            type: 'mrkdwn',
            text: `*Security Issues:*\n\`${payload.securityIssuesCount}\``,
          },
          {
            type: 'mrkdwn',
            text: `*AI Findings:*\n\`${payload.highConfidenceFindingsCount}\``,
          },
          {
            type: 'mrkdwn',
            text: `*Linear Defect:*\n${
              linearIssueUrl ? `<${linearIssueUrl}|${linearIssueIdentifier || 'View Issue'}>` : '`None`'
            }`,
          },
        ],
      },
    ];

    if (payload.details && payload.details.length > 0) {
      const detailLines = payload.details.map((d) => `• *${d.label}:* ${d.value}`).join('\n');
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Key Evidence & Assessment:*\n${detailLines}`,
        },
      });
    }

    // Action buttons
    const elements: any[] = [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'View GitHub PR',
          emoji: true,
        },
        url: prUrl,
        style: status === 'passed' ? 'primary' : undefined,
      },
    ];

    if (linearIssueUrl) {
      elements.push({
        type: 'button',
        text: {
          type: 'plain_text',
          text: `View Linear (${linearIssueIdentifier || 'Ticket'})`,
          emoji: true,
        },
        url: linearIssueUrl,
        style: 'danger',
      });
    }

    blocks.push({
      type: 'actions',
      elements,
    });

    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '⚡ *SentinelFlow AI* — Automated Quality & Reliability Engine',
        },
      ],
    });

    return { blocks };
  }

  /**
   * Dispatch notification to Slack channel.
   */
  public async sendNotification(payload: SlackNotificationPayload): Promise<boolean> {
    const message = this.buildBlockKitMessage(payload);

    if (!this.webhook) {
      console.log('\n[SentinelFlow Slack] (Simulation / No Webhook Configured)');
      console.log('---------------------------------------------------------');
      console.log(`Status: ${payload.status.toUpperCase()}`);
      console.log(`PR: #${payload.prNumber} (${payload.prTitle})`);
      console.log(`Summary: ${payload.summary}`);
      if (payload.linearIssueUrl) {
        console.log(`Linear: ${payload.linearIssueIdentifier} -> ${payload.linearIssueUrl}`);
      }
      console.log('---------------------------------------------------------\n');
      return true;
    }

    try {
      await this.webhook.send(message);
      return true;
    } catch (err: any) {
      console.error(`[SentinelFlow Slack] Failed to send notification: ${err.message}`);
      return false;
    }
  }
}
