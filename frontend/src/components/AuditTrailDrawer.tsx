import React from "react";
import { History, X, ShieldAlert, CheckCircle, Clock, Zap } from "lucide-react";

export interface AuditEvent {
  id: number | string;
  session_id: string;
  order_id?: string;
  action_type: string;
  actor: string;
  details: any;
  created_at: string;
}

interface AuditTrailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  logs: AuditEvent[];
}

export const AuditTrailDrawer: React.FC<AuditTrailDrawerProps> = ({
  isOpen,
  onClose,
  logs,
}) => {
  if (!isOpen) return null;

  const getBadgeStyle = (actionType: string) => {
    switch (actionType) {
      case "POLICY_BREAKDOWN_GENERATED":
        return { bg: "rgba(99, 102, 241, 0.15)", text: "#a5b4fc", border: "rgba(99, 102, 241, 0.3)" };
      case "PAYMENT_ORDER_CREATED":
        return { bg: "rgba(59, 130, 246, 0.15)", text: "#93c5fd", border: "rgba(59, 130, 246, 0.3)" };
      case "PAYMENT_VERIFIED":
        return { bg: "rgba(16, 185, 129, 0.15)", text: "#6ee7b7", border: "rgba(16, 185, 129, 0.3)" };
      case "RECOVERY_TRIGGERED":
        return { bg: "rgba(225, 29, 72, 0.15)", text: "#fda4af", border: "rgba(225, 29, 72, 0.3)" };
      default:
        return { bg: "rgba(148, 163, 184, 0.15)", text: "#cbd5e1", border: "rgba(148, 163, 184, 0.3)" };
    }
  };

  const getActorIcon = (actionType: string) => {
    switch (actionType) {
      case "POLICY_BREAKDOWN_GENERATED":
        return <Zap size={14} color="#818cf8" />;
      case "PAYMENT_VERIFIED":
        return <CheckCircle size={14} color="#34d399" />;
      case "RECOVERY_TRIGGERED":
        return <ShieldAlert size={14} color="#f43f5e" />;
      default:
        return <Clock size={14} color="#60a5fa" />;
    }
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 99999,
      display: "flex",
      justifyContent: "flex-end",
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      backdropFilter: "blur(4px)",
    }}>
      <div style={{
        backgroundColor: "#0d0e17",
        borderLeft: "1px solid rgba(255, 255, 255, 0.1)",
        width: "100%",
        maxWidth: "480px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        boxShadow: "-10px 0 30px rgba(0, 0, 0, 0.5)",
        color: "#f8fafc",
        fontFamily: "inherit"
      }}>
        {/* Drawer Header */}
        <div style={{
          padding: "20px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <History size={20} color="#818cf8" />
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>Decision & Payment Audit Log</h3>
              <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8" }}>Immutable event trace for this session</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              padding: "6px"
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Timeline Content */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "18px"
        }}>
          {!logs || logs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#64748b" }}>
              <History size={36} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
              <p style={{ margin: 0, fontSize: "14px" }}>No audit events logged for this session yet.</p>
            </div>
          ) : (
            logs.map((log, index) => {
              const badge = getBadgeStyle(log.action_type);
              const detailsObj = typeof log.details === "string" ? JSON.parse(log.details) : log.details;

              return (
                <div key={log.id || index} style={{
                  position: "relative",
                  paddingLeft: "24px",
                  borderLeft: "2px solid rgba(255, 255, 255, 0.12)",
                }}>
                  {/* Bullet */}
                  <div style={{
                    position: "absolute",
                    left: "-8px",
                    top: "0px",
                    width: "14px",
                    height: "14px",
                    borderRadius: "50%",
                    backgroundColor: "#1e1b4b",
                    border: "2px solid #818cf8",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }} />

                  <div style={{
                    backgroundColor: "#13141f",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "10px",
                    padding: "14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px"
                  }}>
                    {/* Header */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px" }}>
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        padding: "3px 8px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: 700,
                        backgroundColor: badge.bg,
                        color: badge.text,
                        border: `1px solid ${badge.border}`
                      }}>
                        {getActorIcon(log.action_type)}
                        {log.action_type}
                      </span>
                      <span style={{ fontSize: "11px", color: "#64748b" }}>
                        {new Date(log.created_at).toLocaleTimeString()}
                      </span>
                    </div>

                    {/* Actor */}
                    <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                      Actor: <strong style={{ color: "#e2e8f0" }}>{log.actor}</strong>
                    </div>

                    {/* Details */}
                    {detailsObj && (
                      <pre style={{
                        margin: 0,
                        backgroundColor: "#07080d",
                        border: "1px solid rgba(255, 255, 255, 0.05)",
                        borderRadius: "6px",
                        padding: "10px",
                        fontSize: "11px",
                        color: "#cbd5e1",
                        overflowX: "auto",
                        fontFamily: "monospace"
                      }}>
                        {JSON.stringify(detailsObj, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};