# CommercePilot — Autonomous Agentic Commerce OS

> **Track 01:** AI Growth & Agentic Commerce
> *Grow the merchant's revenue, and make them sellable to AI buyers — with bounded, explainable, and gated execution.*

🎥 **Demo Video:** [ADD YOUTUBE/GOOGLE DRIVE LINK HERE]
🔗 **Live Repo:** https://github.com/abhishekvarma149/commerce-pilot.git
📸 **Screenshots:** [jump to Screenshots](#-screenshots)

---

## 📌 Executive Summary

**CommercePilot** is an agentic commerce infrastructure engine that turns static e-commerce catalogs into dynamic, AI-transactable storefronts. A multi-agent LangGraph pipeline handles discovery, recommendation, and upsell negotiation in natural language — but **every financial decision is re-derived and enforced server-side** before it ever reaches a Razorpay payment token. Discounts are bounded, prices are tamper-proof, and every action — from a policy violation to a dropped payment modal — is written to an immutable audit trail.

The result: a merchant that can safely let an AI buyer negotiate, without ever trusting the AI buyer's math.

---

## 🎯 Track 01 Alignment & "The Bar"

| Evaluation Criteria | How CommercePilot Delivers |
| :--- | :--- |
| **Grow Merchant Revenue** | LangGraph Growth Agent proposes contextual bundle upsells (e.g., screen protector with a phone) to lift Average Order Value (AOV). |
| **Agent-Readable Catalog** | Catalog is embedded via `pgvector` for semantic similarity search, enabling natural-language product discovery and multi-criteria filtering. |
| **Every Money Action Explainable** | Server-computed price breakdowns (`basePrice`, `discountPct`, `totalAmount`) with a real-time **Audit Trail Drawer** showing exactly what each agent proposed, why, and what the Policy Engine did with it. |
| **Bounded Execution** | Hard ceiling (`MAX_DISCOUNT = 20%`) enforced by a pure algorithmic Policy Engine, fully isolated from LLM inference. Out-of-bounds requests are **clamped, not crashed**. |
| **Gated Pre-Payment** | A LangGraph `interruptBefore` node halts the agent graph immediately before payment. No order token is signed until the backend independently re-derives price and stock from PostgreSQL. |
| **Immutable Audit Trail** | Append-only `audit_logs` table capturing every agent decision, policy check, and payment state transition. |
| **Graceful Failure Handling** | Dedicated Cart Recovery flow: detects a dismissed payment modal, preserves the locked price under a 15-minute TTL, and supports one-click resume with full re-verification. |

---

## 🏗 System Architecture

```text
                  +-----------------------------------+
                  |   AI Buyer / Natural Language      |
                  |     (UAP / ACP / AP2 / Web UI)     |
                  +-----------------+-------------------+
                                    |
                                    v
+-----------------------------------+-----------------------------------+
|                    COMMERCEPILOT LANGGRAPH ENGINE                     |
|                                                                       |
|  START -> Catalog Agent -> Recommendation Agent -> Growth Agent      |
|              (pgvector)         (LLM eval)         (bundle + offer)  |
|                                                          |            |
|                                                          v            |
|                                          Payment Node (interruptBefore)|
|                                          -> hands control to client   |
+-----------------------------------┬------------------------------------+
                                    |
                       +------------+------------+
                       v                         v
             +----------------------+   +-------------------------+
             |  Policy & Guardrail  |   |   PostgreSQL + pgvector  |
             |  Engine (Node.js)    |   |   • Products / Embeds    |
             |  • 20% hard ceiling  |   |   • Orders / Locks       |
             |  • Clamp-then-log    |   |   • Immutable Audit Log  |
             +----------------------+   +-------------------------+
                       |
                       v
             +----------------------+
             |  Razorpay Gateway    |
             |  (Test Mode)         |
             |  • HMAC-SHA256       |
             |  • Signed Order ID   |
             +----------------------+
                       |
                       v
             +----------------------+
             |  Redis               |
             |  • Session cache     |
             |  • Graph checkpoints |
             +----------------------+
```

**On the "gated" requirement, specifically:** the Payment Node isn't just a policy check — it's a hard `interruptBefore` breakpoint in the LangGraph state machine. The graph is structurally incapable of reaching a signed payment token without this checkpoint completing. This is the human/client confirmation step for a shopper's own purchase; it does not gate agent-to-agent price negotiation upstream of it, which is where the autonomous bundling and discount logic runs freely within the Policy Engine's bounds.

---

## 🧠 Multi-Agent Orchestration (LangGraph)

CommercePilot's reasoning layer is a `StateGraph` (`CommerceState`) with four sequential nodes:

| Node | Responsibility |
| :--- | :--- |
| **Catalog Agent** | Runs a `pgvector` similarity search over `products` to retrieve the top 5 candidates matching intent + budget. Read-only — cannot set or alter price. |
| **Recommendation Agent** | Uses an LLM (Gemini) to pick the best candidate and produce reasoning + a confidence score. |
| **Growth Agent** | Proposes a contextual accessory bundle and a *suggested* discount. It has no pricing authority — it hands the proposal to the Policy Engine, which is the sole authority to accept, clamp, or reject it. |
| **Payment Node** | Sets `needsApproval = true` and interrupts the graph (`interruptBefore`), returning control to the client for checkout. |

**Flow:** `START → Catalog Agent → Recommendation Agent → Growth Agent → Payment Node (HITL) → END`

---

## 🔒 Policy Engine & Guardrails

The Policy Engine is pure, deterministic TypeScript — no LLM inference in the pricing path. This eliminates hallucinated discounts and prompt-injection pricing attacks entirely.

**Discount Matrix:**

| Tier | Discount |
| :--- | :--- |
| Discovery Offer | 10% |
| Negotiated Counter | up to 15% |
| **Hard Ceiling** | **20% (`MAX_DISCOUNT`)** |

**Clamp-then-log behavior:** a request exceeding 20% is not silently rejected and it does not crash the session. The engine:
1. Logs a `POLICY_VIOLATION_BLOCKED` event recording *both* the requested and the enforced value.
2. Clamps the discount down to the 20% floor.
3. Overrides the agent's response text to tell the buyer the request exceeds store policy and offers the maximum authorized discount instead.

> **Note on naming:** the event is called `POLICY_VIOLATION_BLOCKED` because the *requested* discount was blocked — the *transaction* proceeds at the clamped rate, it isn't aborted.

---

## 🛡 Security & Threat Mitigation

| Threat | Mitigation | Layer |
| :--- | :--- | :--- |
| LLM price hallucination | Agents only *propose*; all math is static, deterministic functions | Policy Engine |
| Client-side payload tampering | Client-submitted prices/discounts are discarded; price is reconstructed from `products` on both initial checkout **and retry** | `/api/checkout/create-order`, `/retry-check` |
| Concession overrun | Discounts hard-capped at 20%, clamped automatically | Policy Engine |
| Payment spoofing | Order completion requires a valid HMAC-SHA256 signature verified server-side | Verification webhook |
| Inventory DoS | Stock is soft-locked (`inventory_locks`, 15-min TTL) but only decremented from `inventory` after `PAYMENT_VERIFIED` — an attacker can't lock stock without paying | Checkout + Verification |
| State desynchronization | All transitions written to an append-only `audit_logs` table | PostgreSQL |

### Try it yourself — payload tampering test
```bash
# Attempt to forge a ₹1 price with a 99% discount
curl -X POST http://localhost:8000/api/checkout/create-order \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "f58207a5-e019-4843-b550-81c459e8f8c0",
    "requestedAmount": 1,
    "tamperedDiscount": 99
  }'
```
**Result:** the backend ignores both fields, recalculates against the authoritative `products` row, and signs the Razorpay order at the real price (e.g., ₹24,999).

---

## 🔁 Graceful Failure Handling — Dropped Payment Recovery

```text
[Step 1: Checkout Initiated]
  Razorpay modal opens for the server-gated amount (e.g., ₹26,198).
  → Event logged: CHECKOUT_INITIATED

[Step 2: Modal Dismissed / Payment Interrupted]
  Buyer closes the gateway window or authorization is interrupted.
  → Event logged: MODAL_DISMISSED_OR_DROPPED
  → Order status: PAYMENT_PENDING

[Step 3: Graceful Failure State Displayed]
  UI mounts the "Payment Interrupted" recovery view:
  • "Transaction was closed before authorization was complete."
  • Negotiated price lock preserved under a 15-minute TTL session-bound cache
  • Stock remains soft-locked (not released) for the same window

[Step 4: One-Click Retry]
  Buyer clicks "Retry Payment (₹26,198)"
  → Event logged: PAYMENT_RETRY_INITIATED
  → Server re-verifies price AND stock against PostgreSQL before reopening the gateway

[Step 5: Verification & Ledger Update]
  Payment completes → HMAC-SHA256 signature validated → stock decremented
  → Order status: PAID
  → Event logged: PAYMENT_VERIFIED

[Fallback: TTL Expiration]
  If no retry occurs within 15 minutes, a background sweep (every 60s) marks
  the order FAILED and releases the inventory lock.
  → Event logged: PAYMENT_LOCK_EXPIRED
```

Retry is never a blind resume — price and stock are re-derived from the database every time, including on retry, so a stale or tampered client state can never slip through.

---
## 📋 Audit Trail Event Reference

| Event | Meaning |
| :--- | :--- |
| `DISCOVERY_MATCH_GENERATED` | Vector search returns catalog matches / candidate bundles |
| `POLICY_BREAKDOWN_GENERATED` | Itemized price breakdown calculated and locked server-side |
| `POLICY_VIOLATION_BLOCKED` | Requested discount exceeded the 20% ceiling; clamped and logged |
| `CHECKOUT_INITIATED` | Gated order token generated and linked to the active session |
| `RECOVERY_MODAL_DISMISSED` | Gateway closed before authorization; order held as `PAYMENT_PENDING` |
| `PAYMENT_RETRY_INITIATED` | Resume triggered; price and stock re-verified against PostgreSQL |
| `PAYMENT_VERIFIED` | HMAC signature confirmed; order marked `PAID`, invoice generated |
| `PAYMENT_LOCK_EXPIRED` | Order transitioned to `FAILED` after the 15-minute inactivity TTL |

---

## 📸 Screenshots

**Negotiation clamped to the policy ceiling** — the buyer asks for 30% off; the Growth Agent negotiates but the Policy Engine clamps the accessory-bundle discount to the 20% authorized maximum, and the bundle stays visible in the side panel with the enforced price.
![Upsell negotiation clamped to policy limit](./assets/upsell.png)

**Immutable audit trail (live)** — the Decision & Payment Audit Log drawer, showing `PAYMENT_VERIFIED`, a recovery event, and `POLICY_BREAKDOWN_GENERATED` with the actual `basePrice` / `finalTotal` / `upsellPrice` breakdown, each tagged with its acting agent.
![Audit trail drawer](./assets/audit-log.png
)

**Graceful failure recovery** — a dropped payment lands in `PAYMENT_PENDING` under Orders & Tax Receipts, with the price locked and a one-click "Retry Payment" action at the original amount.
![Retry payment after a dropped checkout](./assets/retry-payment.png
)

---

## 🌐 Why Now

NPCI's UAP and the global protocol race (ACP, AP2, x402) are converging on the same open problem: how does an AI buyer transact safely with a merchant it doesn't control? CommercePilot's answer is protocol-agnostic by design — the Policy & Guardrail Engine sits *below* the conversational layer, so it doesn't matter whether the buyer arrives via a UAP-compliant rail, ACP, AP2, or a plain web chat: nothing reaches Razorpay without passing through the same server-side price and stock re-derivation.

---

## 🛠 Tech Stack

- **Frontend:** React (Vite, TypeScript), Lucide Icons, CSS Modules
- **Backend:** Node.js, Express.js, TypeScript
- **AI Orchestration:** LangChain, LangGraph (`@langchain/langgraph`), Google Gemini (`@google/genai`)
- **Database:** PostgreSQL — relational data + vector embeddings via `pgvector`
- **Caching / Checkpointing:** Redis
- **Payments:** Razorpay Test Mode APIs (Orders, Signatures, Webhooks)

---

## 🚀 Quickstart Guide

### Prerequisites
- Node.js v18+
- PostgreSQL instance with the `pgvector` extension enabled (local, Supabase, or Neon)
- Redis instance (local or hosted)
- Razorpay Test Mode Key & Secret
- Google Gemini API key

### 1. Clone & Install
```bash
git clone [ADD REAL GITHUB URL HERE]
cd commerce-pilot

npm install
cd frontend && npm install && cd ..
```

### 2. Configure Environment Variables

`backend/.env`
```env
PORT=8000
DATABASE_URL=postgresql://user:password@localhost:5432/commercepilot
REDIS_URL=redis://localhost:6379
GEMINI_API_KEY=your_gemini_api_key
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_razorpay_secret
```

`frontend/.env`
```env
VITE_API_URL=http://localhost:8000
VITE_RAZORPAY_KEY_ID=rzp_test_your_key_id
```

### 3. Initialize Database & Seed Catalog
```bash
npm run db:migrate
npm run db:seed
```

### 4. Run Development Servers
```bash
# Backend (port 8000)
npm run dev

# Frontend (port 5173), in a separate terminal
cd frontend
npm run dev
```
