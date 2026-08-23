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
      position: "fixed",
      inset: 0,
      zIndex: 9999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0, 0, 0, 0.75)",
      backdropFilter: "blur(6px)",
      padding: "16px"
    }}>
      <div style={{
        backgroundColor: "#13141f",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: "16px",
        width: "100%",
        maxWidth: "460px",
        overflow: "hidden",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
        color: "#f8fafc",
        fontFamily: "inherit"
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <ShieldCheck size={20} color="#818cf8" />
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>Policy Gated Checkout</h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              padding: "4px"
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {paymentStatus === "FAILED" ? (
            /* Failure & Recovery */
            <div style={{
              backgroundColor: "rgba(225, 29, 72, 0.1)",
              border: "1px solid rgba(225, 29, 72, 0.3)",
              borderRadius: "12px",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "12px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#fb7185", fontWeight: 600, fontSize: "14px" }}>
                <AlertTriangle size={18} />
                <span>Payment Interrupted</span>
              </div>
              <p style={{ margin: 0, fontSize: "13px", color: "#cbd5e1", lineHeight: 1.4 }}>
                {failureReason || "Transaction was aborted. Your cart and discounted rates remain locked."}
              </p>
              <button
                disabled={loading}
                onClick={() => handleAction(onRetryPayment)}
                style={{
                  marginTop: "6px",
                  width: "100%",
                  padding: "10px 16px",
                  backgroundColor: "#e11d48",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px"
                }}
              >
                <RefreshCw size={15} className={loading ? "spin" : ""} />
                Retry Payment (₹{breakdown.finalTotal.toLocaleString("en-IN")})
              </button>
            </div>
          ) : paymentStatus === "SUCCESS" ? (
            /* Success State */
            <div style={{
              backgroundColor: "rgba(16, 185, 129, 0.1)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              borderRadius: "12px",
              padding: "24px",
              textAlign: "center"
            }}>
              <CheckCircle2 size={40} color="#34d399" style={{ margin: "0 auto 12px" }} />
              <h4 style={{ margin: "0 0 6px", fontSize: "16px", color: "#6ee7b7", fontWeight: 600 }}>Order Confirmed!</h4>
              <p style={{ margin: 0, fontSize: "13px", color: "#94a3b8" }}>Payment verified via Razorpay.</p>
            </div>
          ) : (
            /* Standard Breakdown */
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#cbd5e1" }}>
                  <span>{productName}</span>
                  <span style={{ fontWeight: 600, color: "#ffffff" }}>₹{breakdown.basePrice.toLocaleString("en-IN")}</span>
                </div>

                {accessoryName && breakdown.upsellPrice > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#cbd5e1" }}>
                    <span>{accessoryName} (Add-on)</span>
                    <span style={{ fontWeight: 600, color: "#ffffff" }}>₹{breakdown.upsellPrice.toLocaleString("en-IN")}</span>
                  </div>
                )}

                {breakdown.discountAmount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#34d399" }}>
                    <span>Bounded Discount ({breakdown.effectiveDiscountPct}%)</span>
                    <span>-₹{breakdown.discountAmount.toLocaleString("en-IN")}</span>
                  </div>
                )}

                <div style={{
                  borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                  paddingTop: "12px",
                  marginTop: "4px",
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "15px",
                  fontWeight: 700
                }}>
                  <span>Final Authorized Total</span>
                  <span style={{ color: "#a5b4fc" }}>₹{breakdown.finalTotal.toLocaleString("en-IN")}</span>
                </div>
              </div>

              {/* Policy Decision Banner */}
              <div style={{
                backgroundColor: "rgba(99, 102, 241, 0.12)",
                border: "1px solid rgba(99, 102, 241, 0.3)",
                borderRadius: "8px",
                padding: "10px 14px",
                fontSize: "12px",
                color: "#c7d2fe",
                lineHeight: 1.4
              }}>
                <strong>Policy Engine Decision:</strong> {breakdown.explanation}
              </div>

              {/* Approval Button */}
              <button
                disabled={loading}
                onClick={() => handleAction(onConfirmPayment)}
                style={{
                  width: "100%",
                  padding: "12px",
                  backgroundColor: "#7658ee",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "10px",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  boxShadow: "0 4px 14px rgba(118, 88, 238, 0.35)",
                  transition: "opacity 0.2s"
                }}
              >
                {loading ? <RefreshCw size={16} className="spin" /> : "Approve & Pay with Razorpay"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};