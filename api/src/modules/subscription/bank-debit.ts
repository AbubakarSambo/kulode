/** Marks a payment that was started as a Direct Debit charge (payment plus mandate in one request). */
export const DIRECT_DEBIT_CHARGE_FLOW = 'direct_debit_charge';

type Authorization = { channel?: string; card_type?: string } | undefined | null;

/** The authorization itself is a bank mandate, so it can be saved and charged for renewals. */
export const isMandateAuthorization = (authorization: Authorization): boolean =>
  authorization?.channel === 'direct_debit' || authorization?.card_type === 'mandate';

/**
 * The money came from a bank debit, so it must not replace the saved card. A Direct Debit charge counts
 * whatever its authorization looks like (a one-off activation transfer is not a card either).
 */
export const isBankDebitPayment = (authorization: Authorization, metadata?: { payment_flow?: string } | null): boolean =>
  isMandateAuthorization(authorization) || metadata?.payment_flow === DIRECT_DEBIT_CHARGE_FLOW;
