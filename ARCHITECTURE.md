# System Architecture Documentation: CommercePilot OS

---

## 1. System Overview

CommercePilot OS is a bounded, explainable, and tamper-proof agentic commerce execution engine. It enables autonomous AI buyers and human shoppers to interact with dynamic merchant inventories via natural language, while enforcing deterministic financial guardrails and server-signed payment gating on every transaction.

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

---

## 2. Core Architectural Components

### 2.1. Multi-Agent Orchestration (LangGraph)

CommercePilot's reasoning layer is a `StateGraph` called `CommerceState`, executed as a sequential pipeline of four nodes.

**State (`CommerceState`) holds:**
- `userMessage` — the input query from the user
- `budget` — optional budget constraints
- `candidates` — array of potential products retrieved from the vector database
- `recommendation` — the final evaluated product recommendation
- `growthOffer` — dynamically generated bundle/upsell offer
- `needsApproval` — boolean flag that triggers the human-in-the-loop (HITL) breakpoint before payment

**Graph flow:**
```
START → Catalog Agent → Recommendation Agent → Growth Agent → Payment Node (HITL) → END
```

| Node | Role | Pricing Authority |
| :--- | :--- | :--- |
| **Catalog Agent** | Performs a `pgvector` similarity search over the `products` table to retrieve the top 5 candidates matching intent + budget. | None — strictly read-only. |
| **Recommendation Agent** | Evaluates retrieved candidates via LLM (Gemini) to select the best match, with reasoning and a confidence score. | None. |
| **Growth Agent** | Proposes a contextual accessory bundle (e.g., screen protector for a phone) and a *suggested* discount based on conversation context. | None — proposes only. |
| **Payment Node** | Sets `needsApproval = true` and interrupts the graph (`interruptBefore`), returning control to the client interface for checkout. | Enforced downstream by the Policy Engine, not by this node. |

**Handoff contract:** The Growth Agent has no pricing authority. It hands its proposal to the Policy & Guardrail Engine, which is the sole authority that accepts, clamps, or rejects the proposal to compute the final locked price. No agent node can write a price directly to an order.

**On "gated pre-payment," specifically:** The Payment Node is not merely a policy check — it is a hard `interruptBefore` breakpoint in the LangGraph state machine. The graph is structurally incapable of reaching a signed Razorpay order token without this checkpoint completing. This interrupt is the confirmation step for the shopper's own purchase; it does not gate the upstream agent-to-agent negotiation, where autonomous bundling and discount logic runs freely within the Policy Engine's bounds.

---

### 2.2. Policy & Financial Guardrail Engine

**Role:** Enforces deterministic merchant constraints and concession bounds on every transaction.

**Execution model:** Pure algorithmic validation (TypeScript/Node.js), fully isolated from LLM inference, to prevent hallucinated discounts and prompt-injection pricing attacks.

**Discount Matrix:**

| Tier | Discount |
| :--- | :--- |
| Discovery Offer | Standard 10% bundle concession |
| Negotiated Counter | Scaled up to 15% concession |
| **Ceiling Cap** | **Hard limit at 20% (`max_bundle_discount_pct = 0.20`)** |

**Interception handler — clamp-then-log:** Any request exceeding 20% does not crash the session and is not silently dropped. The engine:
1. Logs a `POLICY_VIOLATION_BLOCKED` audit event, recording both the requested and the enforced value.
2. Clamps the discount down to the 20% merchant floor.
3. Overrides the agent's outgoing response text to inform the buyer the request exceeds store policy, and offers the maximum authorized discount instead.

> **Naming note:** the event is named `POLICY_VIOLATION_BLOCKED` because the *requested* discount is what gets blocked — the transaction itself proceeds at the clamped rate, it is not aborted.

---

### 2.3. Pre-Payment Gating & Verification Engine

**Role:** Generates and validates cryptographically signed payment tokens prior to gateway handoff.

**Security model:** Discards all client-side submitted prices, currencies, and discounts. The backend independently recalculates every line item against authoritative database rates and generates signed Razorpay order IDs server-side using secret keys never exposed to the client.

**Verification pipeline:** Validates incoming payment webhooks and payloads using HMAC-SHA256 signatures (`razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`).

---

### 2.4. Autonomous Cart Recovery Agent

**Role:** Preserves cart state during drop-offs, modal exits, or network interruptions, without clearing negotiated concessions.

**State management & stock reservation:**
- A gateway dismissal is caught via the `ondismiss` client event and updates order status to `PAYMENT_PENDING`.
- The locked order amount is preserved under a strict **15-minute TTL** session-bound cache.
- **Inventory allocation:** Stock (`stock_count`) is checked at checkout initiation and again at retry, but is only *definitively* decremented upon `PAYMENT_VERIFIED` — this prevents a malicious actor from locking up inventory without ever paying (an inventory denial-of-service).
- Re-initiating payment from the UI or Orders dashboard re-attaches the existing order token, with a full server-side rate and stock re-verification — never a blind resume.
- Inactive orders transition to `FAILED` with event `PAYMENT_LOCK_EXPIRED` after TTL expiration, via a background sweep running every 60 seconds.

**Optimistic Concurrency Strategy:** Because the price/stock lock is session-bound rather than a hard database reservation, the system prioritizes high-throughput availability. Two buyers can simultaneously hold a "locked price" view on the last unit of an item for up to 15 minutes. Whoever completes signature verification first wins the unit; the slower transaction gracefully fails during the backend stock re-check (step 18 of the transaction sequence below) and their order is marked `FAILED`. This is a deliberate, scalable tradeoff to avoid the inventory-DoS vector described above.

---

## 3. Database Schema & Data Models

```text
+------------------------------------+       +------------------------------------+
|             products               |       |              orders                |
+------------------------------------+       +------------------------------------+
| id           : UUID (PK)           |       | id           : UUID (PK)           |
| name         : VARCHAR(255)        |   +---| session_id   : VARCHAR(100) (FK)   |
| description  : TEXT                |   |   | product_id   : UUID (FK)           |
| base_price   : NUMERIC(10, 2)      |<--+   | total_amount : NUMERIC(10, 2)      |
| category     : VARCHAR(100)        |       | discount_pct : NUMERIC(5, 2) [1]   |
| specifications: JSONB              |       | status       : VARCHAR(50)         |
| embedding    : VECTOR(1536)        |       | rzp_order_id : VARCHAR(100)        |
| stock_count  : INT                 |       | created_at   : TIMESTAMP           |
| is_active    : BOOLEAN             |       +-----------------+------------------+
+------------------------------------+                         |
                                                                 |
+------------------------------------+       +------------------------------------+
|          inventory_locks           |       |            audit_logs              |
+------------------------------------+       +------------------------------------+
| id          : UUID (PK)            |       | id          : UUID (PK)            |
| order_id    : UUID (FK)            |       | order_id    : UUID (FK)            |<--+
| product_id  : UUID (FK)            |       | session_id  : VARCHAR(100)         |
| quantity    : INT                  |       | event_type  : VARCHAR(100)         |
| expires_at  : TIMESTAMP (15m TTL)  |       | payload     : JSONB                |
+------------------------------------+       | created_at  : TIMESTAMP            |
                                              +------------------------------------+

Also present: users, merchants (identity), payments (Razorpay transaction
tracking), merchant_policies / offers (dynamic discount limit configuration).
```

**`[1] discount_pct`** stores the final, post-clamp enforced discount rate — not the raw requested value — so the ledger always matches the amount actually sent to the payment gateway.

**Table roles:**
- `products` — authoritative store inventory, base rates, and vector embeddings for semantic search
- `orders` — active and completed transactions (`PAYMENT_PENDING`, `PAID`, `FAILED`)
- `inventory_locks` — temporary, TTL-bound holds on stock during an in-flight payment
- `audit_logs` — append-only event store detailing every policy check, discount adjustment, drop event, and signature verification

---

## 4. End-to-End Transaction Sequence

```text
AI Buyer              CommercePilot Core        Policy Engine         PostgreSQL DB        Razorpay Gateway
   |                         |                        |                     |                     |
   |--- 1. Search Query ---->|                        |                     |                     |
   |    ("Phone + Charger")  |--- 2. Fetch Catalog (pgvector) ------------->|                     |
   |                         |<-- 3. Base Products & Upsells ---------------|                     |
   |<-- 4. Dynamic Bundle ---|                        |                     |                     |
   |                         |                        |                     |                     |
   |--- 5. Force 30% Disc -->|                        |                     |                     |
   |                         |--- 6. Evaluate Rule -->|                     |                     |
   |                         |                        |-- 7. Block & Clamp->| (Log Violation)     |
   |                         |<-- 8. Return 20% Cap --|                     |                     |
   |                         |                        |                     |                     |
   |--- 9. Checkout Req ---->|                        |                     |                     |
   |    (Forged Payload)     |--- 10. Re-verify Base Rates & Stock -------->|                     |
   |                         |--- 11. Create Gated Order (interruptBefore) -------------------->|
   |                         |<-- 12. Signed Order ID --------------------------------------------|
   |<-- 13. Open Gateway ----|                        |                     |                     |
   |                         |                        |                     |                     |
   |-- 14. Drop/Close Modal->|                        |                     |                     |
   |                         |--- 15. Catch Dismiss ----------------------->| (PAYMENT_PENDING)   |
   |                         |<-- 16. State Retained (15m TTL) -------------|                     |
   |                         |                        |                     |                     |
   |-- 17. Retry Payment --->|--- 18. Re-Verify Stock & Price Integrity --->|                     |
   |-- 19. Complete Auth --->|                        |                     |                     |
   |                         |--- 20. Verify HMAC-SHA256 Signature ------------------------------>|
   |                         |--- 21. Seal Tx & Decrement Stock ----------->| (Status: PAID)      |
   |<-- 22. Verified Invoice-|                        |                     |                     |
```

---

## 5. Security & Threat Mitigation Model

| Threat / Attack Vector | System Mitigation Strategy | Implementation Layer |
| :--- | :--- | :--- |
| LLM Price Hallucination | Generative models only propose recommendations; all calculations execute via static, deterministic math functions | Node.js Policy Engine |
| Client-Side Payload Tampering | Amounts sent via HTTP bodies are discarded; order prices are reconstructed from database records on both initial checkout and retry | Pre-Payment Gate (`/api/checkout/create-order`, `/retry-check`) |
| Concession Overrun | Total discount percentages hard-bounded at ≤ 20%; excess concessions are clamped, not fatally rejected | Policy Validation Engine |
| Payment Spoofing | Order completion requires a valid HMAC-SHA256 signature verified using secret environment keys | Verification Webhook Handler |
| Inventory Denial-of-Service | Stock is soft-locked (`inventory_locks`, 15-min TTL) but only decremented after `PAYMENT_VERIFIED` | Checkout + Verification |
| State Desynchronization | All transactional state changes are tracked via an append-only immutable event stream | PostgreSQL `audit_logs` |

### Try it yourself — payload tampering test
```bash
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

## 6. Audit Trail Event Reference

| Event | Meaning |
| :--- | :--- |
| `DISCOVERY_MATCH_GENERATED` | Vector search yields catalog matches and candidate upsell pairs |
| `POLICY_BREAKDOWN_GENERATED` | Itemized price breakdown calculated and locked on the server |
| `POLICY_VIOLATION_BLOCKED` | Discount request exceeding the 20% margin ceiling intercepted, clamped, and logged |
| `CHECKOUT_INITIATED` | Pre-gated order token generated and linked to the active session |
| `RECOVERY_MODAL_DISMISSED` | Gateway closure caught; order held in `PAYMENT_PENDING` |
| `PAYMENT_RETRY_INITIATED` | Resumption triggered; server re-verifies price and stock against PostgreSQL |
| `PAYMENT_VERIFIED` | HMAC signature confirmed; order marked `PAID`, invoice generated |
| `PAYMENT_LOCK_EXPIRED` | Order transitioned to `FAILED` after the 15-minute inactivity TTL |

---

## 7. Frontend Architecture

- **Unified Interface:** a single page (`App.tsx`) merges standard e-commerce views (Products, Orders, Offers & Policies) with the conversational Assistant interface.
- **Gated Checkout Modal:** captures the Razorpay flow, handling successes, failures, and modal dismissals, and updates backend state accordingly.
- **Audit Trail Drawer (`AuditTrailDrawer.tsx`):** a real-time debugging view letting merchants inspect exactly what each agent proposed, why, and when policy guardrails triggered.
- **Session resilience:** the frontend pulls the current session/thread state to allow seamless continuation of a shopping session across a page reload.

---

## 8. Tech Stack

- **Frontend:** React (Vite, TypeScript), Lucide Icons, CSS Modules
- **Backend:** Node.js, Express.js, TypeScript
- **AI Orchestration:** LangChain, LangGraph (`@langchain/langgraph`), Google Gemini (`@google/genai`)
- **Database:** PostgreSQL — relational data + vector embeddings via `pgvector`
- **Caching / Checkpointing:** Redis
- **Payments:** Razorpay Test Mode APIs (Orders, Signatures, Webhooks)