import React, { useState, useEffect } from "react";
import { X, ShieldCheck, Check, RefreshCw } from "lucide-react";

interface PolicyManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiUrl: string;
}

export const PolicyManagerModal: React.FC<PolicyManagerModalProps> = ({
  isOpen,
  onClose,
  apiUrl,
}) => {
  const [maxDiscount, setMaxDiscount] = useState<number>(15);
  const [loading, setLoading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetch(`${apiUrl}/api/analytics/policy`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.policy) {
            setMaxDiscount(Number(data.policy.max_discount_pct));
          }
        })
        .catch((err) => console.error("Failed to load merchant policy:", err))
        .finally(() => setLoading(false));
    }
  }, [isOpen, apiUrl]);

  if (!isOpen) return null;

  const handleSave = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${apiUrl}/api/analytics/policy`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_discount_pct: maxDiscount }),
      });
      const data = await res.json();
      if (data.success) {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 2500);
      }
    } catch (err) {
      console.error("Failed to update policy:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(5px)",
      }}
    >
      <div
        style={{
          backgroundColor: "#0d0e17",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: "14px",
          width: "90%",
          maxWidth: "480px",
          padding: "24px",
          color: "#f8fafc",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <ShieldCheck size={22} color="#818cf8" />
            <h2 style={{ margin: 0, fontSize: "17px" }}>Merchant Policy Thresholds</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer" }}
          >
            <X size={20} />
          </button>
        </div>

        <p style={{ margin: 0, fontSize: "13px", color: "#94a3b8" }}>
          Set strict boundaries for the autonomous AI checkout engine. The policy engine will dynamically enforce this maximum cap on bundle discounts.
        </p>

        {/* Policy Controls */}
        <div
          style={{
            backgroundColor: "#13141f",
            padding: "16px",
            borderRadius: "10px",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "13px", fontWeight: 600 }}>Max Bundle Discount Cap</span>
            <span
              style={{
                fontSize: "14px",
                fontWeight: 700,
                color: "#818cf8",
                backgroundColor: "rgba(99, 102, 241, 0.15)",
                padding: "2px 8px",
                borderRadius: "6px",
              }}
            >
              {maxDiscount}%
            </span>
          </div>

          <input
            type="range"
            min="0"
            max="40"
            step="1"
            value={maxDiscount}
            onChange={(e) => setMaxDiscount(Number(e.target.value))}
            style={{ width: "100%", accentColor: "#6366f1", cursor: "pointer" }}
          />

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#64748b" }}>
            <span>0% (Strict No Discount)</span>
            <span>20% (Standard)</span>
            <span>40% (Aggressive)</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "6px" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 14px",
              borderRadius: "8px",
              backgroundColor: "transparent",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              color: "#94a3b8",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading}
            style={{
              padding: "8px 18px",
              borderRadius: "8px",
              backgroundColor: "#4f46e5",
              border: "none",
              color: "#ffffff",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "13px",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {loading ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : savedSuccess ? (
              <Check size={14} />
            ) : null}
            {savedSuccess ? "Saved Policy!" : "Save Policy"}
          </button>
        </div>
      </div>
    </div>
  );
};
