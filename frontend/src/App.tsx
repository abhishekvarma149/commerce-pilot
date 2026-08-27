import { useState, useEffect, useMemo } from "react";
import {
  Bot,
  Check,
  CheckCircle,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Cpu,
  History,
  MessageCircle,
  Minus,
  Package,
  Percent,
  Plus,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";

import {
  getActiveThreadId,
  getSavedSessions,
  saveSessionMeta,
  setActiveThread,
  createNewSession,
  deleteSession,
  type ChatSession,
} from "./utils/sessionHistory";
import { ChatHistoryDrawer } from "./components/ChatHistoryDrawer";
import { GatedCheckoutModal } from "./components/GatedCheckoutModal";
import { AuditTrailDrawer, type AuditEvent } from "./components/AuditTrailDrawer";
import { OrdersView } from "./components/OrdersView";
import { PolicyManagerModal } from "./components/PolicyManagerModal";
import { CartDrawer, type CartItem } from "./components/CartDrawer";
import { ProductsView } from "./components/ProductsView";

import "./App.css";

type Product = {
  id: string;
  name: string;
  description: string;
  category: string;
  price: string;
  currency: string;
  specifications: Record<string, string>;
  use_cases: string[];
};

type UpsellOffer = {
  title: string;
  price: number;
  discountedFrom?: number;
  note?: string;
  discountPct?: number;
};

type ChatMessage = {
  role: string;
  text: string;
  product?: Product;
  confidence?: number;
  id?: string;
};

type AddToCartProduct = {
  id: string;
  name: string;
  category?: string;
  price: number | string;
  discountPct?: number;
};

const API_URL = "http://localhost:8000";
function App() {
  const [threadId, setThreadId] = useState<string>(() => getActiveThreadId());
  const [sessions, setSessions] = useState<ChatSession[]>(() => getSavedSessions());
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);

  const initSavedState = (tid: string) => {
    const saved = localStorage.getItem(`commercepilot_state_${tid}`);
    return saved ? JSON.parse(saved) : null;
  };

  const initialSaved = useMemo(() => initSavedState(threadId), []);

  const [message, setMessage] = useState(() => initialSaved?.message || "");
  const [loading, setLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  // Chat & Product State
  const [recommendation, setRecommendation] = useState<Product | null>(() => initialSaved?.recommendation || null);
  const [upsell, setUpsell] = useState<UpsellOffer | null>(() => initialSaved?.upsell || null);
  const [includeUpsell, setIncludeUpsell] = useState(false);
  const [reply, setReply] = useState(() => initialSaved?.reply || "");
  const [confidence, setConfidence] = useState(() => initialSaved?.confidence || 92);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(`commercepilot_messages_${threadId}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Policy Gating & Failure Recovery State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"IDLE" | "PROCESSING" | "FAILED" | "SUCCESS">("IDLE");
  const [failureReason, setFailureReason] = useState<string>("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState({
    basePrice: 0,
    upsellPrice: 0,
    requestedDiscountPct: 0,
    effectiveDiscountPct: 0,
    discountAmount: 0,
    finalTotal: 0,
    explanation: "",
  });

  // Audit Trail Drawer State
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditEvent[]>([]);
  const [isOrdersOpen, setIsOrdersOpen] = useState(false);
  const [isPolicyOpen, setIsPolicyOpen] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isProductsOpen, setIsProductsOpen] = useState(false);
  const [isCartCheckout, setIsCartCheckout] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);

  interface SignalMetrics {
    aiAssistedOrders: number;
    aiRevenue: number;
    conversionRate: string;
  }

  const [metrics, setMetrics] = useState<SignalMetrics>({
    aiAssistedOrders: 0,
    aiRevenue: 0,
    conversionRate: "0.0%",
  });

  const fetchMetrics = async () => {
    try {
      const res = await fetch(`${API_URL}/api/analytics/metrics`);
      const data = await res.json();
      if (data.success && data.data) {
        setMetrics(data.data);
      }
    } catch (err) {
      const errorObj = { role: "assistant", text: "Sorry, I encountered an error. Please try again." };
      setMessages((prev) => {
        const updated = [...prev, errorObj];
        localStorage.setItem(`commercepilot_messages_${threadId}`, JSON.stringify(updated));
        return updated;
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    localStorage.setItem(`commercepilot_state_${threadId}`, JSON.stringify({
      message, recommendation, upsell, reply, confidence
    }));

    if (message) {
      const sessionTitle = message.slice(0, 30);
      saveSessionMeta(threadId, sessionTitle);
      setSessions(getSavedSessions());
    }
  }, [message, recommendation, upsell, reply, confidence, threadId]);

  const handleSelectSession = (selectedId: string) => {
    setActiveThread(selectedId);
    setThreadId(selectedId);
    const parsed = initSavedState(selectedId);
    setMessage(parsed?.message || "");
    setRecommendation(parsed?.recommendation || null);
    setUpsell(parsed?.upsell || null);
    setReply(parsed?.reply || "");
    setConfidence(parsed?.confidence || 92);
    setMessages(JSON.parse(localStorage.getItem(`commercepilot_messages_${selectedId}`) || "[]"));
  };

  const handleStartNewChat = () => {
    const newId = createNewSession();
    setThreadId(newId);
    setMessage("");
    setReply("");
    setRecommendation(null);
    setUpsell(null);
    setConfidence(92);
    setMessages([]);
    setSessions(getSavedSessions());
  };

  const handleDeleteSession = (idToDelete: string) => {
    deleteSession(idToDelete);
    setSessions(getSavedSessions());
    
    if (idToDelete === threadId) {
      handleStartNewChat();
    }
  };

  const handleAddToCart = (product: AddToCartProduct, isAccessory = false, openCart = true) => {
    setCartItems((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id 
            ? { ...item, quantity: item.quantity + (openCart ? 1 : 0), discountPct: product.discountPct || item.discountPct } 
            : item
        );
      }
      return [
        ...prev,
        {
          id: product.id,
          name: product.name,
          category: product.category || "General",
          price: Number(product.price),
          quantity: 1,
          isAccessory,
          discountPct: product.discountPct,
        },
      ];
    });
    
    setToastMessage("Added to cart");
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleUpdateQuantity = (id: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((item) =>
          item.id === id ? { ...item, quantity: item.quantity + delta } : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const handleRemoveItem = (id: string) => {
    setCartItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleProceedToGatedCheckoutFromCart = async () => {
    if (cartItems.length === 0) return;

    setIsCartCheckout(true);
    const mainItem = cartItems.find((i) => !i.isAccessory) || cartItems[0];
    const accessoryItem = cartItems.find((i) => i.isAccessory);

    // Map cart items to recommendation and upsell states
    const mockProduct: Product = {
      id: mainItem.id,
      name: mainItem.quantity > 1 ? `${mainItem.name} (x${mainItem.quantity})` : mainItem.name,
      category: mainItem.category || "General",
      price: String(mainItem.price),
      description: "",
      currency: "INR",
      specifications: {},
      use_cases: [],
    };
    setRecommendation(mockProduct);

    const hasAccessory = !!accessoryItem;
    setIncludeUpsell(hasAccessory);
    if (accessoryItem) {
      setUpsell({
        title: accessoryItem.quantity > 1 ? `${accessoryItem.name} (x${accessoryItem.quantity})` : accessoryItem.name,
        price: accessoryItem.price,
      });
    } else {
      setUpsell(null);
    }

    setIsCartOpen(false);

    try {
      const res = await fetch(`${API_URL}/api/checkout/preview-breakdown`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: mainItem.id,
          quantity: mainItem.quantity,
          includeUpsell: hasAccessory,
          upsellQuantity: accessoryItem ? accessoryItem.quantity : 0,
          requestedDiscountPct: upsell ? upsell.discountPct : undefined,
          userSessionId: threadId,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setBreakdown(data.breakdown);
        setPaymentStatus("IDLE");
        setIsModalOpen(true);
      } else {
        alert("Could not calculate policy breakdown.");
      }
    } catch (err) {
      console.error("Failed to preview policy breakdown:", err);
      alert("Could not calculate policy breakdown.");
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [paymentStatus]);

  const sendMessage = async (overrideMessage?: string) => {
    const userQuery = overrideMessage || message;
    if (!userQuery.trim() || loading) return;

    setMessage(""); // clear immediately
    setLoading(true);
    setReply("");

    const isYes = /^(yes|yeah|sure|add it|please add|ok|okay|yep)(\s|$|\.|!)/i.test(userQuery.trim());
    if (isYes && recommendation) {
      handleAddToCart(recommendation, false, false);
      if (upsell) {
        handleAddToCart({
          id: `up-${recommendation.id}`,
          name: upsell.title || "Accessory",
          category: recommendation.category,
          price: upsell.discountedFrom || upsell.price,
          discountPct: upsell.discountPct
        }, true, false);
      }
    }

    // Append user message immediately
    const userMessageObj = { role: "user", text: userQuery };
    setMessages((prev) => {
      const updated = [...prev, userMessageObj];
      localStorage.setItem(`commercepilot_messages_${threadId}`, JSON.stringify(updated));
      return updated;
    });

    try {
      const response = await fetch(`${API_URL}/api/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userQuery,
          threadId: threadId,
        }),
      });

      const data = await response.json();

      if (data.success) {
        const { recommendation: recData, upsell: upsellData } = data.data;

        if (recData && recData.recommendedProduct) {
          setRecommendation(recData.recommendedProduct);
          setConfidence(Math.round(recData.confidence * 100));
        } else {
          setReply("I processed your request, but couldn't find an exact match in the catalog.");
          setRecommendation(null);
        }

        if (recData && recData.summary) {
          setReply(recData.summary);

          const aiMessageObj: ChatMessage = { role: "assistant", text: recData.summary };

          // Attach product to the message if it's newly recommended
          if (recData.recommendedProduct) {
            if (!recommendation || recommendation.id !== recData.recommendedProduct.id) {
              aiMessageObj.product = recData.recommendedProduct;
              aiMessageObj.confidence = Math.round(recData.confidence * 100);
            }
          }

          setMessages((prev) => {
            const updated = [...prev, aiMessageObj];
            localStorage.setItem(`commercepilot_messages_${threadId}`, JSON.stringify(updated));
            return updated;
          });
        }

        if (upsellData) {
          setUpsell(upsellData);
          
          // Silently update the discount in the cart if the accessory is already there
          setCartItems((prev) => {
            const upId = `up-${recData?.recommendedProduct?.id || recommendation?.id}`;
            const exists = prev.find(item => item.id === upId);
            if (exists) {
              return prev.map(item => 
                item.id === upId 
                  ? { ...item, discountPct: upsellData.discountPct }
                  : item
              );
            }
            return prev;
          });
        }

        // Silent refresh of audit logs when any agent response is received
        fetchAuditLogs(true);
      } else {
        setReply("Something went wrong. Please try again.");
      }
    } catch (error) {
      setReply("Network error. Make sure your backend server is running on port 8000.");
    } finally {
      setLoading(false);
    }
  };

  const submitExample = (text: string) => {
    setMessage(text);
    sendMessage(text);
  };

  // 1. Preview Breakdown & Open Bounded Approval Modal
  const initiateGatedCheckout = async () => {
    if (!recommendation) {
      alert("No product selected. Please search for a product first.");
      return;
    }

    setIsCartCheckout(false);
    setCheckoutLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/checkout/preview-breakdown`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: recommendation.id,
          includeUpsell: includeUpsell,
          userSessionId: threadId,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setBreakdown(data.breakdown);
        setPaymentStatus("IDLE");
        setIsModalOpen(true);
      } else {
        alert(`Checkout error: ${data.error || "Could not calculate policy breakdown."}`);
      }
    } catch (err) {
      console.error("Failed to preview policy breakdown:", err);
      alert("Could not connect to checkout service. Is the backend running?");
    } finally {
      setCheckoutLoading(false);
    }
  };

  // 2. Razorpay Trigger with ondismiss and payment.failed Listeners
  const handleRazorpayPayment = async (orderData: { amount: number; currency: string; orderId: string; keyId: string; }) => {
    const envKey = import.meta.env.VITE_RAZORPAY_KEY_ID;
    const resolvedKey = (envKey && envKey !== "undefined") ? envKey : orderData.keyId;

    const options = {
      key: resolvedKey,
      amount: orderData.amount,
      currency: orderData.currency || "INR",
      name: "CommercePilot",
      description: `Order for ${recommendation?.name || "Product"}`,
      order_id: orderData.orderId,
      handler: async function (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string; }) {
        setPaymentStatus("SUCCESS");

        const verifyRes = await fetch(`${API_URL}/api/checkout/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            sessionId: threadId,
          }),
        });

        if (verifyRes.ok) {
          // Refresh database metrics instantly
          fetchMetrics();

          // Inject AI Chat Message
          const injection = {
            id: Date.now().toString(),
            role: "assistant",
            text: `Payment Confirmed! 🎉 Your order for ₹${orderData.amount / 100} has been successfully paid and your items are secured. You can view your invoice anytime from the Orders section.`,
          };
          setMessages((prev) => {
            const next = [...prev, injection];
            localStorage.setItem(`commercepilot_messages_${threadId}`, JSON.stringify(next));
            return next;
          });
          
          setToastMessage("Payment Successful!");
          setTimeout(() => setToastMessage(null), 3000);
        }

        if (isCartCheckout) {
          setCartItems([]);
        }
      },
      modal: {
        ondismiss: function () {
          setPaymentStatus("FAILED");
          setFailureReason("Transaction was closed before authorization was complete.");
          // We DO NOT release the reservation or mark as FAILED in the database immediately.
          // The order is held in PAYMENT_PENDING for 15 minutes.
        },
      },
      theme: { color: "#7658ee" },
    };

    const rzp = new (window as any).Razorpay(options);

    rzp.on("payment.failed", async function (response: { error: { description: string } }) {
      setPaymentStatus("FAILED");
      setFailureReason(response.error.description || "Payment authorization failed.");

      try {
        await fetch(`${API_URL}/api/checkout/cancel-reservation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ razorpay_order_id: orderData.orderId }),
        });
      } catch (err) {
        // Silently handle lock release failure on client
      }

      await fetch(`${API_URL}/api/checkout/recover-failed-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: threadId,
          orderId: orderData.orderId,
          failureReason: response.error.description,
        }),
      });
    });

    rzp.open();
  };

  // 3. User Approves Gated Breakdown -> Authoritative Order Creation
  const handleConfirmPayment = async () => {
    if (!recommendation) return;

    try {
      let response;
      if (isCartCheckout) {
        response = await fetch(`${API_URL}/api/checkout/checkout-cart`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: cartItems,
            userSessionId: threadId,
          }),
        });
      } else {
        response = await fetch(`${API_URL}/api/checkout/create-order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: recommendation.id,
            includeUpsell: includeUpsell,
            requestedDiscountPct: upsell ? upsell.discountPct : undefined,
            userSessionId: threadId,
          }),
        });
      }

      const orderData = await response.json();
      if (orderData.success) {
        setCurrentOrderId(orderData.orderId);
        await handleRazorpayPayment(orderData);
      } else {
        alert(orderData.error || "Order creation failed.");
      }
    } catch (err) {
      alert("Failed to connect to checkout service.");
    }
  };

  // 4. Fetch Audit Logs for Drawer
  const fetchAuditLogs = async (silent: boolean = false) => {
    if (threadId) {
      try {
        const res = await fetch(`${API_URL}/api/checkout/audit-trail/${threadId}`);
        const data = await res.json();
        
        const logsArray = Array.isArray(data)
          ? data
          : data.logs || data.data || [];

        setAuditLogs(logsArray);
        if (!silent) {
          setIsAuditOpen(true);
        }
      } catch (err) {
        setAuditLogs([]);
        if (!silent) {
          setIsAuditOpen(true);
        }
      }
    }
  };

  const activeBaseProduct = recommendation || cartItems.find((item) => !item.isAccessory);
  const canAddBundle = Boolean(activeBaseProduct);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="brand-name">CommercePilot</div>
            <div className="brand-subtitle">AI Commerce OS</div>
          </div>
        </div>

        <nav className="nav">
          <div className="nav-section">WORKSPACE</div>
          <button className="nav-item active">
            <MessageCircle size={18} />
            Assistant
          </button>
          <button
            type="button"
            className={`nav-item ${isProductsOpen ? "active" : ""}`}
            onClick={() => setIsProductsOpen(true)}
          >
            <Package size={18} />
            Products
          </button>
          <button
            type="button"
            className="nav-item"
            onClick={() => setIsOrdersOpen(true)}
          >
            <ShoppingBag size={18} />
            Orders
          </button>
          <button
            type="button"
            className="nav-item"
            onClick={() => setIsPolicyOpen(true)}
          >
            <Percent size={18} />
            Offers & Policies
          </button>

        </nav>

        <div className="sidebar-bottom">
          <div className="system-card">
            <div className="system-title">
              <span className="status-dot" />
              AI systems online
            </div>
            <div className="system-row">
              <span>Catalog</span>
              <Check size={14} />
            </div>
            <div className="system-row">
              <span>Inventory</span>
              <Check size={14} />
            </div>
            <div className="system-row">
              <span>Payments</span>
              <Check size={14} />
            </div>
          </div>

          <div className="merchant-card">
            <div className="merchant-avatar">T</div>
            <div>
              <div className="merchant-name">TechMart</div>
              <div className="merchant-role">Merchant workspace</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <div className="breadcrumb">
              Workspace <ChevronRight size={14} /> Assistant
            </div>
            <h1>AI Shopping Assistant</h1>
            <p>Find products, compare options and make smarter purchase decisions.</p>
          </div>

          <div className="topbar-actions">
            <div className="live-badge">
              <span className="status-dot" />
              AI Online
            </div>
            <button
              type="button"
              onClick={() => fetchAuditLogs(false)}
              className="icon-button"
              title="View Decision & Payment Audit Trail"
              style={{ cursor: "pointer" }}
            >
              <History size={18} />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => setIsPolicyOpen(true)}
              title="Merchant Policy Bounds"
              style={{ cursor: "pointer" }}
            >
              <ShieldCheck size={18} />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => setIsCartOpen(true)}
              style={{ position: "relative", cursor: "pointer" }}
              title="Shopping Cart"
            >
              <ShoppingCart size={18} />
              {cartItems.length > 0 && (
                <span style={{
                  position: "absolute",
                  top: "-4px",
                  right: "-4px",
                  backgroundColor: "#ef4444",
                  color: "white",
                  borderRadius: "50%",
                  fontSize: "10px",
                  padding: "2px 5px",
                  fontWeight: 700
                }}>
                  {cartItems.reduce((sum, item) => sum + item.quantity, 0)}
                </span>
              )}
            </button>
          </div>
        </header>

        <section className="workspace">
          <div className="conversation-panel">
            <div className="conversation-header">
              <div className="assistant-identity">
                <div className="assistant-avatar">
                  <Bot size={20} />
                </div>
                <div>
                  <div className="assistant-name">CommercePilot</div>
                  <div className="assistant-status">● Ready to help</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setIsHistoryOpen(true)}
                  style={{
                    backgroundColor: "rgba(255, 255, 255, 0.06)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#c7d2fe",
                    padding: "6px 12px",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: 500,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                >
                  💬 Chat History
                </button>

                <button
                  type="button"
                  onClick={handleStartNewChat}
                  style={{
                    backgroundColor: "#6366f1",
                    border: "none",
                    color: "#fff",
                    padding: "6px 12px",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                >
                  + New Chat
                </button>
              </div>
            </div>

            <div className="messages">
              <div className="welcome-message">
                <div className="welcome-icon">
                  <Sparkles size={24} />
                </div>
                <h2>What are you shopping for?</h2>
                <p>Tell me what you need in natural language. I will search the merchant catalog and find the best match.</p>

                <div className="example-grid">
                  <button type="button" onClick={() => submitExample("I need a fast charging phone under ₹30000")}>
                    <Zap size={15} />
                    Fast charging phone
                  </button>
                  <button type="button" onClick={() => submitExample("I need a gaming laptop under ₹70000")}>
                    <Cpu size={15} />
                    Gaming laptop
                  </button>
                  <button type="button" onClick={() => submitExample("Show me the best phone for photography")}>
                    <Search size={15} />
                    Best camera phone
                  </button>
                </div>
              </div>

              {/* Chat Thread */}
              {messages.map((msg: ChatMessage, idx: number) => (
                <div key={idx} className={msg.role === "user" ? "user-message" : "ai-message"}>
                  <div className="message-label">{msg.role === "user" ? "YOU" : "COMMERCEPILOT"}</div>
                  <div className={msg.role === "user" ? "user-bubble" : "ai-response"}>{msg.text}</div>

                  {/* Inline Product Card for new recommendations */}
                  {msg.role === "assistant" && msg.product && (
                    <div className="product-result" style={{ marginTop: "16px" }}>
                      <div className="result-label">BEST MATCH</div>
                      <div className="product-card">
                        <div className="product-image">
                          <Package size={42} />
                        </div>

                        <div className="product-main">
                          <div className="product-category">{msg.product.category}</div>
                          <h3>{msg.product.name}</h3>
                          <p>{msg.product.description}</p>

                          <div className="spec-list">
                            {msg.product.specifications &&
                              Object.entries(msg.product.specifications)
                                .slice(0, 4)
                                .map(([key, value]) => (
                                  <span key={key}>
                                    <strong>{key}:</strong> {String(value)}
                                  </span>
                                ))}
                          </div>

                          <div className="product-actions">
                            <button type="button" className="secondary-button">View details</button>
                            {(() => {
                              const itemInCart = cartItems.find((i) => i.id === msg.product?.id);
                              if (itemInCart) {
                                return (
                                  <div style={{
                                    display: "inline-flex", alignItems: "center", justifyContent: "space-between",
                                    border: "1px solid var(--blue-500)", borderRadius: "var(--r-sm)",
                                    overflow: "hidden", height: "32px", width: "110px", backgroundColor: "white"
                                  }}>
                                    <button 
                                      type="button" 
                                      onClick={() => handleUpdateQuantity(itemInCart.id, -1)}
                                      style={{ 
                                        width: "32px", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", 
                                        background: "white", color: "var(--blue-500)", border: "none", cursor: "pointer"
                                      }}
                                    >
                                      {itemInCart.quantity === 1 ? <Trash2 size={14} /> : <Minus size={14} />}
                                    </button>
                                    <div style={{ flex: 1, textAlign: "center", fontSize: "12px", fontWeight: 700, color: "var(--blue-600)" }}>
                                      {itemInCart.quantity}
                                    </div>
                                    <button 
                                      type="button" 
                                      onClick={() => handleUpdateQuantity(itemInCart.id, 1)}
                                      style={{ 
                                        width: "32px", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", 
                                        background: "white", color: "var(--blue-500)", border: "none", cursor: "pointer"
                                      }}
                                    >
                                      <Plus size={14} />
                                    </button>
                                  </div>
                                );
                              }
                              return (
                                <button
                                  type="button"
                                  onClick={() => msg.product && handleAddToCart(msg.product as unknown as AddToCartProduct, false, true)}
                                  className="secondary-button"
                                >
                                  + Add to Cart
                                </button>
                              );
                            })()}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                initiateGatedCheckout();
                              }}
                              disabled={checkoutLoading}
                              className="primary-button"
                              style={{
                                position: "relative",
                                zIndex: 50,
                                pointerEvents: "auto",
                                opacity: checkoutLoading ? 0.7 : 1
                              }}
                            >
                              {checkoutLoading ? "Loading..." : "Gated Checkout →"}
                            </button>
                          </div>
                        </div>

                        <div className="product-price">
                          <div className="price-label">BEST VALUE</div>
                          <div className="price">
                            {msg.product.currency === "INR" ? "₹" : msg.product.currency}
                            {Number(msg.product.price).toLocaleString("en-IN")}
                          </div>

                          <div className="confidence">
                            <div className="confidence-header">
                              <span>Match score</span>
                              <strong>{msg.confidence || 92}%</strong>
                            </div>
                            <div className="progress">
                              <div className="progress-fill" style={{ width: `${msg.confidence || 92}%` }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="ai-message">
                  <div className="message-label">COMMERCEPILOT</div>
                  <div className="thinking-card">
                    <div className="thinking-icon">
                      <Sparkles size={16} />
                    </div>
                    <div>
                      <div className="thinking-title">Analyzing your request</div>
                      <div className="thinking-subtitle">Searching catalog and evaluating matches...</div>
                    </div>
                  </div>
                </div>
              )}

              {/* End Product Result / Chat Thread */}
            </div>

            <div className="composer-wrapper">
              <div className="composer">
                <div className="composer-icon">
                  <Sparkles size={18} />
                </div>
                <input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") sendMessage();
                  }}
                  placeholder="Ask CommercePilot anything..."
                />
                <button
                  type="button"
                  className="send-button"
                  onClick={() => sendMessage()}
                  disabled={loading || !message.trim()}
                >
                  <Send size={17} />
                </button>
              </div>

              <div className="composer-footer">
                <span>AI recommendations are bounded by merchant policies.</span>
                <span className="secure-label">
                  <ShieldCheck size={13} />
                  Secure
                </span>
              </div>
            </div>
          </div>

          <aside className="right-panel">
            <div className="panel-card">
              <div className="panel-heading">
                <div>
                  <div className="eyebrow">COMMERCE INTELLIGENCE</div>
                  <h3>Live signals</h3>
                </div>
                <Sparkles size={18} />
              </div>

              <div className="metric-card">
                <div className="metric-icon purple">
                  <ShoppingBag size={18} />
                </div>
                <div>
                  <div className="metric-label">AI-assisted orders</div>
                  <div className="metric-value">{metrics.aiAssistedOrders}</div>
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-icon green">
                  <CircleDollarSign size={18} />
                </div>
                <div>
                  <div className="metric-label">AI-attributed revenue</div>
                  <div className="metric-value">₹{Number(metrics.aiRevenue).toLocaleString("en-IN")}</div>
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-icon blue">
                  <Zap size={18} />
                </div>
                <div>
                  <div className="metric-label">Conversion rate</div>
                  <div className="metric-value">{metrics.conversionRate}</div>
                </div>
              </div>

              {upsell && (
                <div 
                  className="panel-card offer-panel"
                  style={{ animation: "fadeIn 0.5s ease-in-out" }}
                >
                  <div className="eyebrow">SMART BUNDLE</div>
                  <div className="offer-title">{upsell.title}</div>
                  <p>{upsell.note || "Add a recommended add-on to save on the bundle."}</p>

                  <div className="offer-product">
                    <div className="offer-product-icon">
                      <Package size={18} />
                    </div>
                    <div>
                      <div className="offer-name">{upsell.title}</div>
                      <div className="offer-price" style={{ display: "flex", alignItems: "center" }}>
                        ₹{upsell.price.toLocaleString("en-IN")}
                        {upsell.discountedFrom && <span>₹{upsell.discountedFrom.toLocaleString("en-IN")}</span>}
                        {upsell.discountPct && (
                          <span style={{ 
                            textDecoration: "none",
                            fontSize: "10px", fontWeight: 700, color: "#2a9e67", 
                            background: "rgba(62, 207, 142, 0.15)", padding: "2px 5px", 
                            borderRadius: "4px", marginLeft: "6px" 
                          }}>
                            {upsell.discountPct}% OFF
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const bundleId = `up-${recommendation?.id}`;
                    const bundleInCart = cartItems.find((i) => i.id === bundleId);
                    
                    if (bundleInCart) {
                      return (
                        <div style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          border: "1px solid #6366f1", borderRadius: "6px",
                          overflow: "hidden", height: "32px", width: "100%", marginTop: "12px", backgroundColor: "white"
                        }}>
                          <button 
                            type="button" 
                            onClick={() => handleUpdateQuantity(bundleId, -1)}
                            style={{ 
                              width: "40px", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", 
                              background: "white", color: "#6366f1", border: "none", cursor: "pointer"
                            }}
                          >
                            {bundleInCart.quantity === 1 ? <Trash2 size={15} /> : <Minus size={15} />}
                          </button>
                          <div style={{ flex: 1, textAlign: "center", fontSize: "13px", fontWeight: 700, color: "#4f46e5" }}>
                            {bundleInCart.quantity} in cart
                          </div>
                          <button 
                            type="button" 
                            onClick={() => handleUpdateQuantity(bundleId, 1)}
                            style={{ 
                              width: "40px", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", 
                              background: "white", color: "#6366f1", border: "none", cursor: "pointer"
                            }}
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                      );
                    }

                    return (
                      <button
                        type="button"
                        disabled={!canAddBundle}
                        onClick={() => {
                          if (!activeBaseProduct) return;

                          const accessory = {
                            id: bundleId,
                            name: upsell.title || "Premium Case",
                            price: upsell.discountedFrom || upsell.price,
                            isAccessory: true,
                            discountPct: upsell.discountPct,
                          };
                          
                          // Check if base product is already in cart
                          const baseProductInCart = cartItems.find((item) => item.id === activeBaseProduct.id);
                          if (!baseProductInCart) {
                            handleAddToCart(activeBaseProduct, false, false);
                          }
                          
                          handleAddToCart(accessory, true, true);
                          setIncludeUpsell(true);
                        }}
                        style={{
                          width: "100%",
                          marginTop: "12px",
                          padding: "8px 14px",
                          borderRadius: "6px",
                          fontSize: "13px",
                          fontWeight: 600,
                          cursor: canAddBundle ? "pointer" : "not-allowed",
                          backgroundColor: canAddBundle ? "#6366f1" : "rgba(255, 255, 255, 0.05)",
                          color: canAddBundle ? "#fff" : "#94a3b8",
                          border: "none",
                          whiteSpace: "nowrap"
                        }}
                      >
                        Add bundle to cart
                      </button>
                    );
                  })()}
                  
                  <div className="policy-note" style={{ marginTop: "14px" }}>
                    <ShieldCheck size={15} />
                    Offer stays within merchant policy limits.
                  </div>
                </div>
              )}
            </div>

            <div className="panel-card payment-panel">
              <div className="eyebrow">CHECKOUT READY</div>
              <div className="payment-status">
                <div className="payment-icon">
                  <CreditCard size={18} />
                </div>
                <div>
                  <div className="payment-title">Secure payment flow</div>
                  <div className="payment-subtitle">Razorpay connected</div>
                </div>
                <span className="status-dot" />
              </div>
            </div>
          </aside>
        </section>
      </main>

      {/* Gated Modal & Recovery UI */}
      <GatedCheckoutModal
        isOpen={isModalOpen}
        onClose={async () => {
          setIsModalOpen(false);
          if (paymentStatus === "FAILED" && currentOrderId) {
            try {
              await fetch(`${API_URL}/api/checkout/dismiss-recovery-modal`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId: threadId, orderId: currentOrderId }),
              });
            } catch (err) {
            }

            const orderTotal = breakdown.finalTotal.toLocaleString("en-IN");
            const injection = {
              id: Date.now().toString(),
              role: "assistant",
              text: `I noticed you stepped away from checkout. Your locked price of ₹${orderTotal} is held in PAYMENT_PENDING for 15 minutes. You can review and retry your purchase anytime from the Orders section.`,
            };

            setMessages((prev) => [...prev, injection]);
            localStorage.setItem(`commercepilot_messages_${threadId}`, JSON.stringify([...messages, injection]));

            setPaymentStatus("IDLE");
          }
        }}
        productName={recommendation?.name || "Product"}
        accessoryName={includeUpsell ? (upsell?.title || "Premium Add-on") : undefined}
        breakdown={breakdown}
        onConfirmPayment={handleConfirmPayment}
        onRetryPayment={handleConfirmPayment}
        paymentStatus={paymentStatus}
        failureReason={failureReason}
      />

      {/* Drawers and Modals */}
      <ChatHistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        sessions={sessions}
        activeThreadId={threadId}
        onSelectSession={handleSelectSession}
        onNewChat={handleStartNewChat}
        onDeleteSession={handleDeleteSession}
      />
      <AuditTrailDrawer
        isOpen={isAuditOpen}
        onClose={() => setIsAuditOpen(false)}
        logs={auditLogs}
      />

      <OrdersView
        isOpen={isOrdersOpen}
        onClose={() => setIsOrdersOpen(false)}
        apiUrl={API_URL}
        sessionId={threadId}
        onRetryOrder={async (order: { razorpay_order_id?: string; id: string | number; total_amount: number | string; currency: string; }) => {
          setIsOrdersOpen(false);
          setCurrentOrderId(order.razorpay_order_id || String(order.id));
          
          let keyId = import.meta.env.VITE_RAZORPAY_KEY_ID;
          if (!keyId || keyId === "undefined") {
            try {
              const res = await fetch(`${API_URL}/api/checkout/config`);
              const config = await res.json();
              keyId = config.keyId;
            } catch (err) {
            }
          }
          
          if (!keyId || keyId === "undefined") {
            keyId = "rzp_test_TT54NDEKFufxBo";
          }

          const orderData = {
            orderId: order.razorpay_order_id || String(order.id),
            amount: Number(order.total_amount) * 100,
            currency: order.currency || "INR",
            keyId
          };
          handleRazorpayPayment(orderData);
        }}
      />

      <PolicyManagerModal
        isOpen={isPolicyOpen}
        onClose={() => setIsPolicyOpen(false)}
        apiUrl={API_URL}
      />

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        apiUrl={API_URL}
        sessionId={threadId}
        onProceedToCheckout={handleProceedToGatedCheckoutFromCart}
      />

      <ProductsView
        isOpen={isProductsOpen}
        onClose={() => setIsProductsOpen(false)}
        apiUrl={API_URL}
        onAddToCart={(p) => {
          handleAddToCart({
            id: p.id,
            name: p.name,
            price: Number(p.price)
          }, p.category.toLowerCase().includes("accessory"));
        }}
      />
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: "fixed",
          bottom: "24px",
          left: "50%",
          transform: "translateX(-50%)",
          backgroundColor: "#1f2937",
          color: "white",
          padding: "12px 24px",
          borderRadius: "8px",
          fontWeight: 600,
          boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
          zIndex: 9999,
          animation: "fadeIn 0.3s ease-in-out",
          display: "flex",
          alignItems: "center",
          gap: "8px"
        }}>
          <CheckCircle size={18} color="#4ade80" />
          {toastMessage}
        </div>
      )}

    </div>
  );
}

export default App;