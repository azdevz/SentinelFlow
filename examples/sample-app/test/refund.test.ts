import { describe, it, expect } from 'vitest';
import { RefundService, RefundRequest } from '../src/refund.js';

describe('RefundService', () => {
  const service = new RefundService();

  const validReq: RefundRequest = {
    transactionId: 'txn_987654321',
    amountCents: 2500,
    reason: 'customer_request',
    initiatedBy: 'support_agent_42',
  };

  it('processes valid refund successfully', async () => {
    const res = await service.processRefund(validReq);
    expect(res.success).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.refundId).toBeDefined();
    expect(service.isRefunded('txn_987654321')).toBe(true);
  });

  it('prevents double refund on the same transaction ID', async () => {
    const duplicateReq: RefundRequest = {
      ...validReq,
      transactionId: 'txn_987654321', // Already refunded in previous test
    };
    const res = await service.processRefund(duplicateReq);
    expect(res.success).toBe(false);
    expect(res.statusCode).toBe(409);
    expect(res.message).toContain('already been processed');
  });

  it('rejects refund with zero or negative amount', async () => {
    const invalidReq: RefundRequest = {
      transactionId: 'txn_new_123',
      amountCents: -500,
      reason: 'customer_request',
      initiatedBy: 'support_agent_42',
    };
    const res = await service.processRefund(invalidReq);
    expect(res.success).toBe(false);
    expect(res.statusCode).toBe(400);
  });
});
