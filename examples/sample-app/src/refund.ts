/**
 * Sample Application — Refund Processing Service
 * Added in feature branch to demonstrate SentinelFlow automated review & testing.
 */

export interface RefundRequest {
  transactionId: string;
  amountCents: number;
  reason: 'customer_request' | 'fraud' | 'duplicate';
  initiatedBy: string;
}

export interface RefundResult {
  success: boolean;
  refundId?: string;
  statusCode: number;
  message: string;
}

export class RefundService {
  private processedRefunds = new Set<string>();

  /**
   * Process refund request with safety checks against double-refunding.
   */
  public async processRefund(req: RefundRequest): Promise<RefundResult> {
    if (!req.transactionId || req.transactionId.trim().length === 0) {
      return {
        success: false,
        statusCode: 400,
        message: 'Invalid transactionId provided.',
      };
    }

    if (req.amountCents <= 0) {
      return {
        success: false,
        statusCode: 400,
        message: 'Refund amount must be greater than zero.',
      };
    }

    if (this.processedRefunds.has(req.transactionId)) {
      return {
        success: false,
        statusCode: 409,
        message: 'A refund has already been processed for this transaction.',
      };
    }

    // Record processed refund
    const refundId = `ref_${Math.random().toString(36).substring(2, 10)}`;
    this.processedRefunds.add(req.transactionId);

    return {
      success: true,
      refundId,
      statusCode: 200,
      message: 'Refund processed successfully.',
    };
  }

  public isRefunded(transactionId: string): boolean {
    return this.processedRefunds.has(transactionId);
  }
}
