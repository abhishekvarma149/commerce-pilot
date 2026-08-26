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

export interface OfferEvaluationResult {
  approved: boolean;
  adjustedOffer: any | null;
  policyReason: string;
}

export const evaluateOfferPolicy = async (
  growthOffer: any,
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

  console.log(`--> [Offer/Policy Engine] Evaluating discount of ₹${discountAmount} (${discountPercentage.toFixed(1)}%)`);

  // Check against maximum allowed percentage
  if (discountPercentage > policy.maxDiscountPercentage) {
    const maxAllowedPrice = originalPrice * (1 - policy.maxDiscountPercentage / 100);
    console.log(`⚠️ Policy Violation: Discount exceeds ${policy.maxDiscountPercentage}%. Adjusting price.`);

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

  // Check against maximum absolute discount value
  if (discountAmount > policy.maxDiscountValue) {
    const maxAllowedPrice = originalPrice - policy.maxDiscountValue;
    console.log(`⚠️ Policy Violation: Discount value exceeds ₹${policy.maxDiscountValue}. Adjusting price.`);

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