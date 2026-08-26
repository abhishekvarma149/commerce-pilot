import React, { useState } from "react";
import { ShieldCheck, AlertTriangle, RefreshCw, CheckCircle2, X } from "lucide-react";

interface PolicyBreakdown {
  basePrice: number;
  upsellPrice: number;
  requestedDiscountPct: number;
  effectiveDiscountPct: number;
  discountAmount: number;
  finalTotal: number;
  explanation: string;
}

interface GatedCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  productName: string;
  accessoryName?: string;
  breakdown: PolicyBreakdown;
  onConfirmPayment: () => Promise<void>;
  onRetryPayment: () => Promise<void>;
  paymentStatus: "IDLE" | "PROCESSING" | "FAILED" | "SUCCESS";
  failureReason?: string;
}

const T = {
  bg: "#ffffff",
  surface: "#f7f8fc",
  border: "#dde0ea",
  borderLight: "#eef0f6",
  textPrimary: "#1a1c2e",
  textSecondary: "#636880",
  textMuted: "#8b91a7",
  blue: "#3b5bff",
  blueBg: "#eef3ff",
  blueBorder: "#b5c8ff",
  green: "#3ecf8e",
  greenBg: "rgba(62,207,142,0.1)",
  greenBorder: "rgba(62,207,142,0.25)",
};

export const GatedCheckoutModal: React.FC<GatedCheckoutModalProps> = ({
  isOpen,
  onClose,
  productName,
  accessoryName,
  breakdown,
  onConfirmPayment,
  onRetryPayment,
  paymentStatus,
  failureReason,
}) => {
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleAction = async (actionFn: () => Promise<void>) => {
    try {
      setLoading(true);
      await actionFn();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center",
      backgroundColor: "rgba(27,31,59,0.35)",
      backdropFilter: "blur(6px)", padding: 16
    }}>
      <div style={{
        backgroundColor: T.bg,
        border: `1px solid ${T.border}`,
        borderRadius: 18,
        width: "100%", maxWidth: 460,
        overflow: "hidden",
        boxShadow: "0 24px 64px rgba(27,31,59,0.16)",
        fontFamily: "inherit"
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px",
          borderBottom: `1px solid ${T.borderLight}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: T.bg
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: T.blueBg,
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <ShieldCheck size={18} color={T.blue} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary }}>Policy Gated Checkout</div>
              <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>AI-verified order summary</div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 8, width: 30, height: 30,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: T.textMuted, cursor: "pointer"
          }}>
            <X size={15} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>

          {paymentStatus === "FAILED" ? (
            /* Failure & Recovery */
            <div style={{
              background: "rgba(239,68,68,0.05)",
              border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 12, padding: 16,
              display: "flex", flexDirection: "column", gap: 12
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#dc2626", fontWeight: 700, fontSize: 14 }}>
                <AlertTriangle size={17} />
                <span>Payment Interrupted</span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: T.textSecondary, lineHeight: 1.5 }}>
                {failureReason || "Transaction was aborted. Your cart and discounted rates remain locked."}
              </p>
              <button
                disabled={loading}
                onClick={() => handleAction(onRetryPayment)}
                style={{
                  marginTop: 4, width: "100%", padding: "11px 16px",
                  background: "#dc2626", color: "#ffffff", border: "none",
                  borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  opacity: loading ? 0.7 : 1
                }}
              >
                <RefreshCw size={15} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
                Retry Payment (₹{breakdown.finalTotal.toLocaleString("en-IN")})
              </button>
            </div>

          ) : paymentStatus === "SUCCESS" ? (
            /* Success State */
            <div style={{
              background: T.greenBg, border: `1px solid ${T.greenBorder}`,
              borderRadius: 14, padding: "28px 20px", textAlign: "center"
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16, background: "rgba(62,207,142,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px"
              }}>
                <CheckCircle2 size={28} color={T.green} />
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#1a5c3a", marginBottom: 6 }}>Order Confirmed!</div>
              <div style={{ fontSize: 13, color: "#2a9e67" }}>Payment verified via Razorpay.</div>
            </div>

          ) : (
            /* Standard Breakdown */
            <>
              {/* Line Items */}
              <div style={{
                background: T.surface, border: `1px solid ${T.borderLight}`,
                borderRadius: 12, padding: "14px 16px",
                display: "flex", flexDirection: "column", gap: 10, fontSize: 14
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: T.textSecondary }}>
                  <span>{productName}</span>
                  <span style={{ fontWeight: 700, color: T.textPrimary }}>₹{breakdown.basePrice.toLocaleString("en-IN")}</span>
                </div>

                {accessoryName && breakdown.upsellPrice > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", color: T.textSecondary }}>
                    <span>{accessoryName} <span style={{ fontSize: 11, color: T.blue, background: T.blueBg, padding: "1px 6px", borderRadius: 100 }}>Add-on</span></span>
                    <span style={{ fontWeight: 700, color: T.textPrimary }}>₹{breakdown.upsellPrice.toLocaleString("en-IN")}</span>
                  </div>
                )}

                {breakdown.discountAmount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#2a9e67", fontWeight: 600 }}>
                    <span>Bounded Discount ({breakdown.effectiveDiscountPct}%)</span>
                    <span>−₹{breakdown.discountAmount.toLocaleString("en-IN")}</span>
                  </div>
                )}

                <div style={{
                  borderTop: `1px solid ${T.border}`, paddingTop: 12, marginTop: 2,
                  display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 800,
                  color: T.textPrimary
                }}>
                  <span>Final Authorized Total</span>
                  <span style={{ color: T.blue }}>₹{breakdown.finalTotal.toLocaleString("en-IN")}</span>
                </div>
              </div>

              {/* Policy Decision Banner */}
              <div style={{
                background: T.blueBg, border: `1px solid ${T.blueBorder}`,
                borderRadius: 10, padding: "10px 14px",
                fontSize: 12, color: "#2d47e8", lineHeight: 1.5
              }}>
                <strong>Policy Engine:</strong> {breakdown.explanation}
              </div>

              {/* Approval Button */}
              <button
                disabled={loading}
                onClick={() => handleAction(onConfirmPayment)}
                style={{
                  width: "100%", padding: "13px",
                  background: T.blue, color: "#ffffff",
                  border: "none", borderRadius: 12,
                  fontWeight: 700, fontSize: 14, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  boxShadow: "0 4px 16px rgba(59,91,255,0.3)",
                  opacity: loading ? 0.75 : 1, transition: "opacity 0.2s"
                }}
              >
                {loading
                  ? <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} />
                  : "Approve & Pay with Razorpay"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};