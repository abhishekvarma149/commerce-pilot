import React, { useState, useEffect } from "react";
import { X, ShieldCheck, Check, RefreshCw, Percent } from "lucide-react";

interface PolicyManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiUrl: string;
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
};

export const PolicyManagerModal: React.FC<PolicyManagerModalProps> = ({
  isOpen,
  onClose,
  apiUrl,
}) => {
  const [maxDiscount, setMaxDiscount] = useState<number>(15);
  const [loading, setLoading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetch(`${apiUrl}/api/analytics/policy`)
        .then((res) => {
          if (!res.ok) throw new Error();
          return res.json();
        })
        .then((data) => {
          if (data.success && data.policy) {
            setMaxDiscount(Number(data.policy.max_discount_pct));
            setError(null);
          } else {
            setError("Failed to load merchant policy.");
          }
        })
        .catch(() => setError("Failed to load merchant policy."))
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
        setError(null);
        setTimeout(() => setSavedSuccess(false), 2500);
      } else {
        setError(data.error || "Failed to update policy.");
      }
    } catch (err) {
      setError("Failed to update policy.");
    } finally {
      setLoading(false);
    }
  };

  const tiers = [
    { label: "Conservative", range: [0, 10], color: T.green },
    { label: "Standard", range: [11, 20], color: T.blue },
    { label: "Aggressive", range: [21, 40], color: "#f59e0b" },
  ];
  const activeTier = tiers.find((t) => maxDiscount >= t.range[0] && maxDiscount <= t.range[1]) || tiers[0];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999,
      display: "flex", alignItems: "center", justifyContent: "center",
      backgroundColor: "rgba(27,31,59,0.35)",
      backdropFilter: "blur(6px)"
    }}>
      <div style={{
        backgroundColor: T.bg,
        border: `1px solid ${T.border}`,
        borderRadius: 18,
        width: "92%", maxWidth: 480,
        boxShadow: "0 24px 64px rgba(27,31,59,0.16)",
        overflow: "hidden",
        fontFamily: "inherit"
      }}>
        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "18px 22px", borderBottom: `1px solid ${T.borderLight}`, background: T.bg
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, background: T.blueBg,
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <ShieldCheck size={18} color={T.blue} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary }}>Merchant Policy Thresholds</div>
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 1 }}>AI checkout boundary control</div>
            </div>
          </div>
          <button type="button" onClick={onClose} style={{
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 8, width: 30, height: 30,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: T.textMuted, cursor: "pointer"
          }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Description */}
          <p style={{ margin: 0, fontSize: 13, color: T.textSecondary, lineHeight: 1.6 }}>
            Set strict boundaries for the autonomous AI checkout engine. The policy engine will dynamically enforce this maximum cap on all bundle discounts.
          </p>

          {error && (
            <div style={{ background: "#fef2f2", color: "#dc2626", padding: "10px 14px", borderRadius: 8, fontSize: 13, border: "1px solid #fecaca" }}>
              {error}
            </div>
          )}

          {/* Policy Controls */}
          <div style={{
            background: T.surface, padding: 18, borderRadius: 14,
            border: `1px solid ${T.borderLight}`,
            display: "flex", flexDirection: "column", gap: 14
          }}>
            {/* Discount Value Row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary }}>Max Bundle Discount Cap</div>
                <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>Applied to all accessory add-ons</div>
              </div>
              <div style={{
                display: "flex", alignItems: "center", gap: 4,
                background: T.blueBg, border: `1px solid ${T.blueBorder}`,
                borderRadius: 100, padding: "4px 12px"
              }}>
                <Percent size={12} color={T.blue} />
                <span style={{ fontSize: 16, fontWeight: 800, color: T.blue }}>{maxDiscount}</span>
              </div>
            </div>

            {/* Slider */}
            <input
              type="range" min="0" max="40" step="1"
              value={maxDiscount}
              onChange={(e) => setMaxDiscount(Number(e.target.value))}
              style={{ width: "100%", accentColor: T.blue, cursor: "pointer", height: 4 }}
            />

            {/* Scale labels */}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.textMuted }}>
              <span>0% · Strict</span>
              <span>20% · Standard</span>
              <span>40% · Aggressive</span>
            </div>
          </div>

          {/* Active Tier Indicator */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 16px", borderRadius: 10,
            background: `${activeTier.color}14`,
            border: `1px solid ${activeTier.color}30`
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%", background: activeTier.color,
              boxShadow: `0 0 8px ${activeTier.color}80`
            }} />
            <div style={{ fontSize: 12, color: activeTier.color, fontWeight: 600 }}>
              {activeTier.label} tier active — {maxDiscount}% cap enforced on all bundles
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="button" onClick={onClose} style={{
              padding: "9px 16px", borderRadius: 9,
              background: "transparent", border: `1px solid ${T.border}`,
              color: T.textSecondary, cursor: "pointer", fontSize: 13, fontWeight: 500
            }}>
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={loading} style={{
              padding: "9px 20px", borderRadius: 9,
              background: savedSuccess ? "#2a9e67" : T.blue,
              border: "none", color: "#ffffff", cursor: "pointer",
              fontWeight: 700, fontSize: 13,
              display: "inline-flex", alignItems: "center", gap: 7,
              boxShadow: savedSuccess
                ? "0 4px 14px rgba(62,207,142,0.3)"
                : "0 4px 14px rgba(59,91,255,0.3)",
              transition: "background 0.2s",
              opacity: loading ? 0.7 : 1
            }}>
              {loading ? (
                <RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} />
              ) : savedSuccess ? (
                <Check size={13} />
              ) : null}
              {savedSuccess ? "Saved!" : "Save Policy"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
