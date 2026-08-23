import { useState } from "react";
import {
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Cpu,
  History,
  LayoutDashboard,
  MessageCircle,
  Package,
  Percent,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Zap,
} from "lucide-react";
import { GatedCheckoutModal } from "./components/GatedCheckoutModal";
import { AuditTrailDrawer, type AuditEvent } from "./components/AuditTrailDrawer";
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
};

const API_URL = "http://localhost:8000";

function App() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Chat & Product State
  const [recommendation, setRecommendation] = useState<Product | null>(null);
  const [upsell, setUpsell] = useState<UpsellOffer | null>(null);
  const [includeUpsell, setIncludeUpsell] = useState(false);
  const [reply, setReply] = useState("");
  const [confidence, setConfidence] = useState(92);
  const [threadId] = useState(`user_session_${Date.now()}`);

  // Policy Gating & Failure Recovery State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"IDLE" | "PROCESSING" | "FAILED" | "SUCCESS">("IDLE");
  const [failureReason, setFailureReason] = useState<string>("");
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

  const sendMessage = async (overrideMessage?: string) => {
    const userQuery = overrideMessage || message;
    if (!userQuery.trim() || loading) return;

    setLoading(true);

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
          setReply(
            recData.summary ||
              "Here is the best match for your request based on our catalog and policy guidelines."
          );
        } else {
          setReply("I processed your request, but couldn't find an exact match in the catalog.");
          setRecommendation(null);
        }

        if (upsellData) {
          setUpsell(upsellData);
        }
      } else {
        setReply("Something went wrong. Please try again.");
      }
    } catch (error) {
      console.error(error);
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
    if (!recommendation) return;

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
      }
    } catch (err) {
      console.error("Failed to preview policy breakdown:", err);
      alert("Could not calculate policy breakdown.");
    }
  };

  // 2. Razorpay Trigger with ondismiss and payment.failed Listeners
  const handleRazorpayPayment = async (orderData: any) => {
    const options = {
      key: import.meta.env.VITE_RAZORPAY_KEY_ID || orderData.keyId,
      amount: orderData.amount * 100,
      currency: orderData.currency || "INR",
      name: "CommercePilot",
      description: `Order for ${recommendation?.name || "Product"}`,
      order_id: orderData.orderId,
      handler: async function (response: any) {
        setPaymentStatus("SUCCESS");
        await fetch(`${API_URL}/api/checkout/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            sessionId: threadId,
          }),
        });
      },
      modal: {
        ondismiss: async function () {
          console.warn("Payment dismissed / aborted");
          setPaymentStatus("FAILED");
          setFailureReason("Transaction was closed before authorization was complete.");

          await fetch(`${API_URL}/api/checkout/recover-failed-payment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: threadId,
              orderId: orderData.orderId,
              failureReason: "MODAL_DISMISSED_OR_DROPPED",
            }),
          });
        },
      },
      theme: { color: "#7658ee" },
    };

    const rzp = new (window as any).Razorpay(options);

    rzp.on("payment.failed", async function (response: any) {
      console.error("Payment failed:", response.error);
      setPaymentStatus("FAILED");
      setFailureReason(response.error.description || "Payment authorization failed.");

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
      const response = await fetch(`${API_URL}/api/checkout/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: recommendation.id,
          includeUpsell: includeUpsell,
          userSessionId: threadId,
        }),
      });

      const orderData = await response.json();
      if (orderData.success) {
        await handleRazorpayPayment(orderData);
      } else {
        alert(orderData.error || "Order creation failed.");
      }
    } catch (err) {
      console.error("Order initiation error:", err);
      alert("Failed to connect to checkout service.");
    }
  };

  // 4. Fetch Audit Logs for Drawer
  const fetchAuditLogs = async () => {
    try {
      console.log("Fetching audit trail for session:", threadId);
      const res = await fetch(`${API_URL}/api/checkout/audit-trail/${threadId}`);
      
      const data = await res.json();
      console.log("Audit log response from server:", data);

      const logsArray = Array.isArray(data) 
        ? data 
        : data.logs || data.data || [];

      setAuditLogs(logsArray);
      setIsAuditOpen(true);
    } catch (err) {
      console.error("Failed to load audit logs:", err);
      setAuditLogs([]);
      setIsAuditOpen(true);
    }
  };

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
          <button className="nav-item">
            <Package size={18} />
            Products
          </button>
          <button className="nav-item">
            <ShoppingBag size={18} />
            Orders
          </button>
          <button className="nav-item">
            <Percent size={18} />
            Offers
          </button>
          <button className="nav-item">
            <LayoutDashboard size={18} />
            Analytics
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
              onClick={fetchAuditLogs}
              className="icon-button"
              title="View Decision & Payment Audit Trail"
              style={{ cursor: "pointer" }}
            >
              <History size={18} />
            </button>
            <button type="button" className="icon-button">
              <ShieldCheck size={18} />
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
              <div className="thread-id">{threadId.toUpperCase()}</div>
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

              {message && (
                <div className="user-message">
                  <div className="message-label">YOU</div>
                  <div className="user-bubble">{message}</div>
                </div>
              )}

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

              {reply && !loading && (
                <div className="ai-message">
                  <div className="message-label">COMMERCEPILOT</div>
                  <div className="ai-response">{reply}</div>
                </div>
              )}

              {recommendation && !loading && (
                <div className="product-result">
                  <div className="result-label">BEST MATCH</div>
                  <div className="product-card">
                    <div className="product-image">
                      <Package size={42} />
                    </div>

                    <div className="product-main">
                      <div className="product-category">{recommendation.category}</div>
                      <h3>{recommendation.name}</h3>
                      <p>{recommendation.description}</p>

                      <div className="spec-list">
                        {recommendation.specifications &&
                          Object.entries(recommendation.specifications)
                            .slice(0, 4)
                            .map(([key, value]) => (
                              <span key={key}>
                                <strong>{key}:</strong> {value}
                              </span>
                            ))}
                      </div>

                      <div className="product-actions">
                        <button type="button" className="secondary-button">View details</button>
                        <button type="button" className="primary-button" onClick={initiateGatedCheckout}>
                          Gated Checkout
                          <ArrowRight size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="product-price">
                      <div className="price-label">BEST VALUE</div>
                      <div className="price">
                        {recommendation.currency === "INR" ? "₹" : recommendation.currency}
                        {Number(recommendation.price).toLocaleString("en-IN")}
                      </div>

                      <div className="confidence">
                        <div className="confidence-header">
                          <span>Match score</span>
                          <strong>{confidence}%</strong>
                        </div>
                        <div className="progress">
                          <div className="progress-fill" style={{ width: `${confidence}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
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
                  <div className="metric-value">342</div>
                </div>
                <span className="positive">+18.4%</span>
              </div>

              <div className="metric-card">
                <div className="metric-icon green">
                  <CircleDollarSign size={18} />
                </div>
                <div>
                  <div className="metric-label">AI-attributed revenue</div>
                  <div className="metric-value">₹8.42L</div>
                </div>
                <span className="positive">+12.7%</span>
              </div>

              <div className="metric-card">
                <div className="metric-icon blue">
                  <Zap size={18} />
                </div>
                <div>
                  <div className="metric-label">Conversion rate</div>
                  <div className="metric-value">18.7%</div>
                </div>
                <span className="positive">+4.2%</span>
              </div>
            </div>

            <div className="panel-card offer-panel">
              <div className="eyebrow">SMART BUNDLE</div>
              <div className="offer-title">{upsell ? upsell.title : "Complete the setup"}</div>
              <p>{upsell?.note || "Add a premium accessory to this purchase and save on the bundle."}</p>

              <div className="offer-product">
                <div className="offer-product-icon">
                  <Package size={18} />
                </div>
                <div>
                  <div className="offer-name">{upsell ? upsell.title : "Premium Case"}</div>
                  <div className="offer-price">
                    ₹{upsell ? upsell.price : "1,274"}
                    {upsell?.discountedFrom && <span>₹{upsell.discountedFrom}</span>}
                  </div>
                </div>

                <button
                  type="button"
                  className="mini-add"
                  onClick={() => setIncludeUpsell(!includeUpsell)}
                  style={{
                    backgroundColor: includeUpsell ? "#10b981" : undefined,
                    color: includeUpsell ? "#ffffff" : undefined,
                  }}
                >
                  {includeUpsell ? "Added ✓" : "Add"}
                </button>
              </div>

              <div className="policy-note">
                <ShieldCheck size={15} />
                Offer stays within merchant policy limits.
              </div>
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
        onClose={() => setIsModalOpen(false)}
        productName={recommendation?.name || "Product"}
        accessoryName={includeUpsell ? (upsell?.title || "Premium Protective Case") : undefined}
        breakdown={breakdown}
        onConfirmPayment={handleConfirmPayment}
        onRetryPayment={handleConfirmPayment}
        paymentStatus={paymentStatus}
        failureReason={failureReason}
      />

      {/* Visual Audit Trail Drawer */}
      <AuditTrailDrawer
        isOpen={isAuditOpen}
        onClose={() => setIsAuditOpen(false)}
        logs={auditLogs}
      />
    </div>
  );
}

export default App;