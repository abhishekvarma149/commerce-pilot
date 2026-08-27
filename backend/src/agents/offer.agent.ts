export interface MerchantPolicy {
  maxDiscountPercentage: number; // e.g., 15%
  maxDiscountValue: number;    // e.g., ₹2000 max cut
  requireApprovalForBundles: boolean;
}

// Default merchant policy rules (in a production app, these could be fetched per merchant from DB)
const defaultPolicy: MerchantPolicy = {
  maxDiscountPercentage: 15,
  maxDiscountValue: 2000,
  requireApprovalForBundles: true,
};

export interface OfferData {
  price: number;
  discountedFrom?: number;
  note?: string;
  [key: string]: unknown;
}

export interface OfferEvaluationResult {
  approved: boolean;
  adjustedOffer: OfferData | null;
  policyReason: string;
}

export const evaluateOfferPolicy = async (
  growthOffer: OfferData | null,
  productPrice: number,
  policy: MerchantPolicy = defaultPolicy
): Promise<OfferEvaluationResult> => {
  // If the Growth Agent didn't propose an offer, pass through cleanly
  if (!growthOffer) {
    return {
      approved: true,
      adjustedOffer: null,
      policyReason: "No growth offer proposed.",
    };
  }

  const originalPrice = growthOffer.discountedFrom || productPrice;
  const offeredPrice = growthOffer.price;
  const discountAmount = originalPrice - offeredPrice;
  const discountPercentage = (discountAmount / originalPrice) * 100;

  /**
   * Discount Clamping (Percentage)
   * 
   * Why: Prevents LLM hallucinations from giving away products for free or breaking
   * merchant margins. If the LLM proposes a 50% discount but the policy cap is 15%,
   * we intercept and automatically adjust the offer price to exactly 15% off.
   */
  if (discountPercentage > policy.maxDiscountPercentage) {
    const maxAllowedPrice = originalPrice * (1 - policy.maxDiscountPercentage / 100);

    return {
      approved: true, // Approved with modification
      adjustedOffer: {
        ...growthOffer,
        price: Math.round(maxAllowedPrice),
        note: `Price adjusted automatically to meet merchant policy (${policy.maxDiscountPercentage}% max discount).`
      },
      policyReason: `Discount capped at merchant maximum rule of ${policy.maxDiscountPercentage}%.`,
    };
  }

  /**
   * Discount Clamping (Absolute Value)
   * 
   * Why: Acts as a secondary safeguard against highly expensive items where a valid
   * percentage discount might still translate to an unacceptably large monetary loss.
   */
  if (discountAmount > policy.maxDiscountValue) {
    const maxAllowedPrice = originalPrice - policy.maxDiscountValue;

    return {
      approved: true,
      adjustedOffer: {
        ...growthOffer,
        price: Math.round(maxAllowedPrice),
        note: `Price adjusted to respect maximum discount limit of ₹${policy.maxDiscountValue}.`,
      },
      policyReason: `Discount capped at absolute maximum limit of ₹${policy.maxDiscountValue}.`,
    };
  }

  // If everything is within limits
  return {
    approved: true,
    adjustedOffer: growthOffer,
    policyReason: "Offer complies with all merchant policy rules.",
  };
};