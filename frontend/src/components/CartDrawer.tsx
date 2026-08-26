import React, { useState, useEffect } from "react";
import { X, Trash2, Plus, Minus, ShieldCheck, ShoppingCart } from "lucide-react";

export interface CartItem {
    id: string;
    name: string;
    category: string;
    price: number;
    quantity: number;
    isAccessory?: boolean;
    discountPct?: number;
}

interface CartDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    items: CartItem[];
    onUpdateQuantity: (id: string, delta: number) => void;
    onRemoveItem: (id: string) => void;
    onProceedToCheckout: () => void;
    apiUrl: string;
    sessionId: string;
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
    red: "#ef4444",
};

export const CartDrawer: React.FC<CartDrawerProps> = ({
    isOpen,
    onClose,
    items,
    onUpdateQuantity,
    onRemoveItem,
    onProceedToCheckout,
    apiUrl,
    sessionId,
}) => {
    const [breakdown, setBreakdown] = useState<{
        subtotal: number;
        discountPercent: number;
        discountAmount: number;
        finalTotal: number;
        policyCap: number;
        policyStatus: string;
    } | null>(null);

    useEffect(() => {
        if (!isOpen || items.length === 0) return;

        const fetchBreakdown = async () => {
            try {
                const accessory = items.find(i => i.isAccessory);
                const res = await fetch(`${apiUrl}/api/checkout/preview-cart-breakdown`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ items, userSessionId: sessionId, requestedDiscountPct: accessory?.discountPct })
                });
                const data = await res.json();
                if (data.success) {
                    setBreakdown(data.breakdown);
                }
            } catch (error) {
                console.error("Failed to fetch cart breakdown:", error);
            }
        };

        fetchBreakdown();
    }, [items, isOpen, apiUrl, sessionId]);

    if (!isOpen) return null;

    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 99999,
            display: "flex", justifyContent: "flex-end",
            backgroundColor: "rgba(27,31,59,0.35)",
            backdropFilter: "blur(4px)"
        }}>
            <div style={{
                backgroundColor: T.bg,
                width: "100%", maxWidth: "420px", height: "100%",
                display: "flex", flexDirection: "column",
                borderLeft: `1px solid ${T.border}`,
                boxShadow: "-8px 0 32px rgba(27,31,59,0.12)",
                color: T.textPrimary,
                fontFamily: "inherit"
            }}>
                {/* Header */}
                <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "18px 20px",
                    borderBottom: `1px solid ${T.borderLight}`,
                    background: T.bg
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 10,
                            background: T.blueBg, display: "flex", alignItems: "center", justifyContent: "center"
                        }}>
                            <ShoppingCart size={18} color={T.blue} />
                        </div>
                        <div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary }}>Shopping Cart</div>
                            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 1 }}>{items.length} item{items.length !== 1 ? "s" : ""}</div>
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

                {/* Cart Item List */}
                <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "10px" }}>
                    {items.length === 0 ? (
                        <div style={{ textAlign: "center", color: T.textMuted, margin: "auto 0", padding: "40px 0" }}>
                            <div style={{
                                width: 56, height: 56, borderRadius: 16, background: T.blueBg,
                                display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px"
                            }}>
                                <ShoppingCart size={24} color={T.blue} style={{ opacity: 0.5 }} />
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: T.textSecondary }}>Your cart is empty</div>
                            <div style={{ fontSize: 12, color: T.textMuted, marginTop: 4 }}>Search for a product to get started.</div>
                        </div>
                    ) : (
                        items.map((item) => (
                            <div key={item.id} style={{
                                backgroundColor: T.surface,
                                padding: "12px 14px", borderRadius: 12,
                                border: `1px solid ${T.borderLight}`,
                                display: "flex", justifyContent: "space-between", alignItems: "center"
                            }}>
                                <div style={{ flex: 1, marginRight: 12 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary }}>{item.name}</div>
                                    <div style={{ fontSize: 11, color: item.isAccessory ? T.blue : T.textSecondary, marginTop: 3 }}>
                                        ₹{item.price.toLocaleString("en-IN")}
                                        {item.isAccessory && (
                                            <span style={{
                                                marginLeft: 6, fontSize: 10, background: T.blueBg,
                                                color: T.blue, padding: "1px 6px", borderRadius: 100, fontWeight: 600
                                            }}>Bundle</span>
                                        )}
                                    </div>
                                </div>

                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <div style={{
                                        display: "flex", alignItems: "center",
                                        background: T.bg, borderRadius: 8,
                                        border: `1px solid ${T.border}`, overflow: "hidden"
                                    }}>
                                        <button type="button" onClick={() => onUpdateQuantity(item.id, -1)} style={{
                                            background: "none", border: "none", color: T.textMuted,
                                            padding: "5px 8px", cursor: "pointer", display: "flex", alignItems: "center"
                                        }}>
                                            <Minus size={11} />
                                        </button>
                                        <span style={{ fontSize: 12, fontWeight: 600, minWidth: 18, textAlign: "center", color: T.textPrimary }}>
                                            {item.quantity}
                                        </span>
                                        <button type="button" onClick={() => onUpdateQuantity(item.id, 1)} style={{
                                            background: "none", border: "none", color: T.textMuted,
                                            padding: "5px 8px", cursor: "pointer", display: "flex", alignItems: "center"
                                        }}>
                                            <Plus size={11} />
                                        </button>
                                    </div>

                                    <button type="button" onClick={() => onRemoveItem(item.id)} style={{
                                        background: "none", border: "none",
                                        color: "#ef4444", cursor: "pointer", padding: 4,
                                        display: "flex", alignItems: "center", borderRadius: 6
                                    }}>
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer & Dynamic Policy Breakdown */}
                {items.length > 0 && (
                    <div style={{
                        borderTop: `1px solid ${T.borderLight}`,
                        padding: "16px 20px 20px",
                        display: "flex", flexDirection: "column", gap: "10px",
                        background: T.bg
                    }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: T.textSecondary }}>
                            <span>Subtotal</span>
                            <span style={{ fontWeight: 600, color: T.textPrimary }}>₹{breakdown?.subtotal?.toLocaleString("en-IN") || items.reduce((a, b) => a + b.price * b.quantity, 0).toLocaleString("en-IN")}</span>
                        </div>

                        {breakdown && breakdown.discountAmount > 0 && (
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: T.green }}>
                                <span>Policy Discount ({breakdown.discountPercent}%)</span>
                                <span style={{ fontWeight: 600 }}>−₹{breakdown.discountAmount.toLocaleString("en-IN")}</span>
                            </div>
                        )}

                        {breakdown && (
                            <div style={{
                                background: T.blueBg, border: `1px solid ${T.blueBorder}`,
                                borderRadius: 10, padding: "10px 12px",
                                display: "flex", alignItems: "flex-start", gap: 8,
                                fontSize: 11, color: "#2d47e8", lineHeight: 1.45
                            }}>
                                <ShieldCheck size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                                <span>Bounded by active merchant discount policy ({breakdown.policyCap}% cap).</span>
                            </div>
                        )}

                        <div style={{
                            display: "flex", justifyContent: "space-between",
                            fontSize: 16, fontWeight: 800,
                            color: T.textPrimary, paddingTop: 4,
                            borderTop: `1px solid ${T.borderLight}`
                        }}>
                            <span>Final Total</span>
                            <span>₹{breakdown?.finalTotal?.toLocaleString("en-IN") || items.reduce((a, b) => a + b.price * b.quantity, 0).toLocaleString("en-IN")}</span>
                        </div>

                        <button type="button" onClick={onProceedToCheckout} style={{
                            width: "100%", padding: "13px",
                            borderRadius: 10, backgroundColor: T.blue,
                            border: "none", color: "#ffffff",
                            fontWeight: 700, fontSize: 14,
                            cursor: "pointer", marginTop: 4,
                            boxShadow: "0 4px 14px rgba(59,91,255,0.3)",
                            transition: "background 0.15s"
                        }}>
                            Checkout with Razorpay →
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};