import React from "react";
import { MessageSquare, Plus, Clock, X, Trash2 } from "lucide-react";
import type { ChatSession } from "../utils/sessionHistory";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  activeThreadId: string;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
}

export const ChatHistoryDrawer: React.FC<Props> = ({
  isOpen,
  onClose,
  sessions,
  activeThreadId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(4px)",
        zIndex: 99999,
        display: "flex",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "320px",
          height: "100%",
          backgroundColor: "#0B0F19",
          borderRight: "1px solid #2D3748",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Clock size={18} color="#818cf8" />
            <h3 style={{ margin: 0, fontSize: "16px", color: "#fff" }}>Chat History</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
          >
            <X size={18} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            onNewChat();
            onClose();
          }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            backgroundColor: "#6366f1",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            padding: "10px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <Plus size={16} /> New Chat
        </button>

        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
          {sessions.length === 0 ? (
            <p style={{ color: "#64748b", fontSize: "13px", textAlign: "center", marginTop: "20px" }}>
              No previous conversations
            </p>
          ) : (
            sessions.map((s) => {
              const isActive = s.id === activeThreadId;
              return (
                <div
                  key={s.id}
                  onClick={() => {
                    onSelectSession(s.id);
                    onClose();
                  }}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "8px",
                    backgroundColor: isActive ? "rgba(99, 102, 241, 0.2)" : "#1A1F2E",
                    border: isActive ? "1px solid #6366f1" : "1px solid #2D3748",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    position: "relative",
                  }}
                >
                  <MessageSquare size={16} color={isActive ? "#818cf8" : "#94a3b8"} />
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    <div style={{ color: "#fff", fontSize: "13px", fontWeight: isActive ? 600 : 400 }}>
                      {s.title}
                    </div>
                    <div style={{ color: "#64748b", fontSize: "11px" }}>
                      {new Date(s.updatedAt).toLocaleDateString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(s.id);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#ef4444",
                      cursor: "pointer",
                      padding: "4px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: isActive ? 1 : 0.6,
                    }}
                    title="Delete Conversation"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
