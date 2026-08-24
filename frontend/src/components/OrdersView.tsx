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
  razorpay_payment_id?: string;
}

interface OrdersViewProps {
  isOpen: boolean;
  onClose: () => void;
  apiUrl: string;
  sessionId?: string;
}

export const OrdersView: React.FC<OrdersViewProps> = ({ isOpen, onClose, apiUrl, sessionId }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"session" | "all">("session");

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      const endpoint =
        activeTab === "session" && sessionId
          ? `${apiUrl}/api/orders?sessionId=${sessionId}`
          : `${apiUrl}/api/orders`;

      fetch(endpoint)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) setOrders(data.orders);
        })
        .catch((err) => console.error("Failed to load orders:", err))
        .finally(() => setLoading(false));
    }
  }, [isOpen, apiUrl, sessionId, activeTab]);

  if (!isOpen) return null;

  const downloadInvoice = (orderId: string | number) => {
    window.open(`${apiUrl}/api/orders/${orderId}/invoice`, "_blank");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PAID":
        return { color: "#34d399", bg: "rgba(16, 185, 129, 0.15)", icon: <CheckCircle size={14} /> };
      case "PAYMENT_PENDING":
        return { color: "#60a5fa", bg: "rgba(59, 130, 246, 0.15)", icon: <Clock size={14} /> };
      default:
        return { color: "#f87171", bg: "rgba(239, 68, 68, 0.15)", icon: <AlertCircle size={14} /> };
    }
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 99999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0, 0, 0, 0.75)",
      backdropFilter: "blur(5px)"
    }}>
      <div style={{
        backgroundColor: "#0d0e17",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: "14px",
        width: "90%",
        maxWidth: "850px",
        maxHeight: "85vh",
        display: "flex",
        flexDirection: "column",
        color: "#f8fafc",
        padding: "24px"
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <ShoppingBag size={22} color="#818cf8" />
            <h2 style={{ margin: 0, fontSize: "18px" }}>Orders & Tax Receipts</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer" }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Toggle */}
        <div style={{
          display: "flex",
          gap: "8px",
          backgroundColor: "#13141f",
          padding: "4px",
          borderRadius: "8px",
          width: "fit-content",
          marginBottom: "16px",
          border: "1px solid rgba(255, 255, 255, 0.08)"
        }}>
          <button
            type="button"
            onClick={() => setActiveTab("session")}
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              fontSize: "12px",
              cursor: "pointer",
              fontWeight: 600,
              backgroundColor: activeTab === "session" ? "#4f46e5" : "transparent",
              color: activeTab === "session" ? "#ffffff" : "#94a3b8",
              border: "none"
            }}
          >
            My Current Session
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              fontSize: "12px",
              cursor: "pointer",
              fontWeight: 600,
              backgroundColor: activeTab === "all" ? "#4f46e5" : "transparent",
              color: activeTab === "all" ? "#ffffff" : "#94a3b8",
              border: "none"
            }}
          >
            All Store Transactions
          </button>
        </div>

        {/* Orders Table */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <p style={{ textAlign: "center", color: "#64748b", padding: "30px 0" }}>Loading orders...</p>
          ) : orders.length === 0 ? (
            <p style={{ textAlign: "center", color: "#64748b", padding: "30px 0" }}>
              {activeTab === "session"
                ? "No completed orders in this session yet."
                : "No store transactions found."}
            </p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.1)", color: "#94a3b8" }}>
                  <th style={{ padding: "10px" }}>Order ID</th>
                  <th style={{ padding: "10px" }}>Product</th>
                  <th style={{ padding: "10px" }}>Amount</th>
                  <th style={{ padding: "10px" }}>Status</th>
                  <th style={{ padding: "10px", textAlign: "right" }}>Invoice</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const badge = getStatusBadge(o.status);
                  return (
                    <tr key={o.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                      <td style={{ padding: "12px 10px", fontFamily: "monospace", fontSize: "11px", color: "#cbd5e1" }}>
                        #{String(o.id).slice(0, 8)}...
                      </td>
                      <td style={{ padding: "12px 10px" }}>{o.product_name || "Catalog Product"}</td>
                      <td style={{ padding: "12px 10px", fontWeight: 600 }}>
                        ₹{Number(o.total_amount).toLocaleString("en-IN")}
                      </td>
                      <td style={{ padding: "12px 10px" }}>
                        <span style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "3px 8px",
                          borderRadius: "6px",
                          fontSize: "11px",
                          backgroundColor: badge.bg,
                          color: badge.color
                        }}>
                          {badge.icon} {o.status}
                        </span>
                      </td>
                      <td style={{ padding: "12px 10px", textAlign: "right" }}>
                        {o.status === "PAID" && (
                          <button
                            type="button"
                            onClick={() => downloadInvoice(o.id)}
                            style={{
                              background: "rgba(99, 102, 241, 0.15)",
                              border: "1px solid rgba(99, 102, 241, 0.3)",
                              color: "#a5b4fc",
                              borderRadius: "6px",
                              padding: "4px 8px",
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              fontSize: "12px"
                            }}
                          >
                            <Download size={13} /> PDF
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