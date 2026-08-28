/**
 * Sample Application — Payment Gateway Processor
 */

export interface PaymentRequest {
  orderId: string;
  amountCents: number;
  currency: string;
  paymentMethodId: string;
}

export interface PaymentResponse {
  success: boolean;
  transactionId?: string;
  statusCode: number;
  errorMessage?: string;
}

export class PaymentService {
  /**
   * Process customer payment with error and timeout handling.
   */
  public async processPayment(
    req: PaymentRequest,
    simulateGatewayTimeout: boolean = false
  ): Promise<PaymentResponse> {
    if (req.amountCents <= 0) {
      return {
        success: false,
        statusCode: 400,
        errorMessage: 'Payment amount must be greater than zero.',
      };
    }

    if (simulateGatewayTimeout) {
      // Graceful timeout handling (HTTP 504 Gateway Timeout)
      return {
        success: false,
        statusCode: 504,
        errorMessage: 'Payment gateway timed out. Please retry or choose another payment method.',
      };
    }

    return {
      success: true,
      statusCode: 200,
      transactionId: `txn_${Math.random().toString(36).substring(2, 10)}`,
    };
  }
}
