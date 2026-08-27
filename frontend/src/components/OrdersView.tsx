import React, { useEffect, useState } from "react";
import { X, Download, ShoppingBag, CheckCircle, Clock, AlertCircle } from "lucide-react";

interface Order {
  id: string | number;
  user_session_id: string;
  product_name: string;
  product_category: string;
  total_amount: number;
  currency: string;
  status: string;
  created_at: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
}

interface OrdersViewProps {
  isOpen: boolean;
  onClose: () => void;
  apiUrl: string;
  sessionId?: string;
  onRetryOrder?: (order: Order) => void;
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
};

export const OrdersView: React.FC<OrdersViewProps> = ({ isOpen, onClose, apiUrl, sessionId, onRetryOrder }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setError(null);
      const endpoint = sessionId 
        ? `${apiUrl}/api/orders?sessionId=${sessionId}` 
        : `${apiUrl}/api/orders`;

      fetch(endpoint)
        .then((res) => {
          if (!res.ok) throw new Error("Network response was not ok");
          return res.json();
        })
        .then((data) => { if (data.success) setOrders(data.orders); else setError("Failed to load orders."); })
        .catch(() => setError("Failed to load orders."))
        .finally(() => setLoading(false));
    }
  }, [isOpen, apiUrl, sessionId]);

  if (!isOpen) return null;

  const downloadInvoice = (orderId: string | number) => {
    window.open(`${apiUrl}/api/orders/${orderId}/invoice`, "_blank");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PAID":
        return { color: "#2a9e67", bg: "rgba(62,207,142,0.12)", icon: <CheckCircle size={13} /> };
      case "PAYMENT_PENDING":
        return { color: "#2d47e8", bg: T.blueBg, icon: <Clock size={13} /> };
      default:
        return { color: "#dc2626", bg: "rgba(239,68,68,0.1)", icon: <AlertCircle size={13} /> };
    }
  };

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
        borderRadius: 16,
        width: "92%", maxWidth: 860,
        maxHeight: "88vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(27,31,59,0.14)",
        overflow: "hidden",
        fontFamily: "inherit"
      }}>
        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "18px 24px", borderBottom: `1px solid ${T.borderLight}`,
          background: T.bg
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, background: T.blueBg,
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <ShoppingBag size={18} color={T.blue} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.textPrimary }}>Orders & Tax Receipts</div>
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 1 }}>Manage your purchase history</div>
            </div>
          </div>
          <button type="button" onClick={onClose} style={{
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 8, width: 32, height: 32,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: T.textMuted, cursor: "pointer"
          }}>
            <X size={16} />
          </button>
        </div>

        {/* Orders Table */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 20px" }}>
          {loading ? (
            <div style={{ textAlign: "center", color: T.textMuted, padding: "40px 0", fontSize: 13 }}>
              Loading orders...
            </div>
          ) : error ? (
            <div style={{ textAlign: "center", color: "#dc2626", padding: "40px 0", fontSize: 13 }}>
              {error}
            </div>
          ) : orders.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14, background: T.blueBg,
                display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px"
              }}>
                <ShoppingBag size={22} color={T.blue} style={{ opacity: 0.5 }} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.textSecondary }}>
                No orders in this session yet.
              </div>
              <div style={{ fontSize: 12, color: T.textMuted, marginTop: 4 }}>
                Complete a checkout to see your orders here.
              </div>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.borderLight}` }}>
                  {["Order ID", "Product", "Amount", "Status", "Invoice / Action"].map((h, i) => (
                    <th key={h} style={{
                      padding: "8px 12px", fontWeight: 600, fontSize: 11,
                      color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.06em",
                      textAlign: i === 4 ? "right" : "left"
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const badge = getStatusBadge(o.status);
                  return (
                    <tr key={o.id} style={{ borderBottom: `1px solid ${T.borderLight}` }}>
                      <td style={{ padding: "14px 12px", fontFamily: "monospace", fontSize: 11, color: T.textMuted }}>
                        #{String(o.id).slice(0, 8)}…
                      </td>
                      <td style={{ padding: "14px 12px", fontWeight: 500, color: T.textPrimary }}>
                        {o.product_name || "Catalog Product"}
                      </td>
                      <td style={{ padding: "14px 12px", fontWeight: 700, color: T.textPrimary }}>
                        ₹{Number(o.total_amount).toLocaleString("en-IN")}
                      </td>
                      <td style={{ padding: "14px 12px" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          padding: "4px 10px", borderRadius: 100,
                          fontSize: 11, fontWeight: 600,
                          backgroundColor: badge.bg, color: badge.color
                        }}>
                          {badge.icon} {o.status}
                        </span>
                      </td>
                      <td style={{ padding: "14px 12px", textAlign: "right" }}>
                        {o.status === "PAID" && (
                          <button type="button" onClick={() => downloadInvoice(o.id)} style={{
                            background: T.blueBg,
                            border: `1px solid ${T.blueBorder}`,
                            color: T.blue, borderRadius: 7,
                            padding: "5px 10px", cursor: "pointer",
                            display: "inline-flex", alignItems: "center", gap: 5,
                            fontSize: 12, fontWeight: 600
                          }}>
                            <Download size={12} /> PDF
                          </button>
                        )}
                        {o.status === "PAYMENT_PENDING" && (
                          <button type="button" onClick={() => onRetryOrder?.(o)} style={{
                            background: "rgba(99, 102, 241, 0.1)",
                            border: "1px solid rgba(99, 102, 241, 0.2)",
                            color: "#4f46e5", borderRadius: 7,
                            padding: "5px 10px", cursor: "pointer",
                            display: "inline-flex", alignItems: "center", gap: 5,
                            fontSize: 12, fontWeight: 600
                          }}>
                            Retry Payment →
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};