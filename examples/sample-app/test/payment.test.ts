import { describe, it, expect } from 'vitest';
import { PaymentService, PaymentRequest } from '../src/payment.js';

describe('PaymentService', () => {
  const service = new PaymentService();

  const validReq: PaymentRequest = {
    orderId: 'ord_123',
    amountCents: 4999,
    currency: 'USD',
    paymentMethodId: 'pm_card_visa',
  };

  it('processes valid payments successfully', async () => {
    const res = await service.processPayment(validReq);
    expect(res.success).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.transactionId).toBeDefined();
  });

  it('rejects payments with zero or negative amounts', async () => {
    const res = await service.processPayment({ ...validReq, amountCents: 0 });
    expect(res.success).toBe(false);
    expect(res.statusCode).toBe(400);
  });

  it('handles gateway timeout with HTTP 504 status code', async () => {
    const res = await service.processPayment(validReq, true);
    expect(res.success).toBe(false);
    expect(res.statusCode).toBe(504);
    expect(res.errorMessage).toContain('timed out');
  });
});
