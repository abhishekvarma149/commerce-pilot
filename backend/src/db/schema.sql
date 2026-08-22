CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Merchants
CREATE TABLE IF NOT EXISTS merchants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Products
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,

    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),

    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),

    currency VARCHAR(10) DEFAULT 'INR',

    specifications JSONB DEFAULT '{}'::jsonb,
    use_cases TEXT[] DEFAULT '{}',

    embedding VECTOR(1536),

    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Inventory
CREATE TABLE IF NOT EXISTS inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID UNIQUE NOT NULL REFERENCES products(id) ON DELETE CASCADE,

    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),

    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Offers
CREATE TABLE IF NOT EXISTS offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,

    name VARCHAR(150) NOT NULL,

    discount_type VARCHAR(20) NOT NULL
        CHECK (discount_type IN ('percentage', 'fixed')),

    discount_value NUMERIC(12, 2) NOT NULL CHECK (discount_value >= 0),

    max_discount NUMERIC(12, 2),

    min_order_value NUMERIC(12, 2),

    max_uses INTEGER,

    used_count INTEGER DEFAULT 0,

    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL REFERENCES users(id),
    merchant_id UUID NOT NULL REFERENCES merchants(id),

    status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (
            status IN (
                'pending',
                'payment_pending',
                'paid',
                'failed',
                'cancelled',
                'completed'
            )
        ),

    subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
    discount NUMERIC(12, 2) DEFAULT 0 CHECK (discount >= 0),
    total NUMERIC(12, 2) NOT NULL CHECK (total >= 0),

    currency VARCHAR(10) DEFAULT 'INR',

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Order Items
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),

    quantity INTEGER NOT NULL CHECK (quantity > 0),

    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),

    total_price NUMERIC(12, 2) NOT NULL CHECK (total_price >= 0)
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    order_id UUID UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

    razorpay_order_id VARCHAR(255),
    razorpay_payment_id VARCHAR(255),

    amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),

    currency VARCHAR(10) DEFAULT 'INR',

    status VARCHAR(30) NOT NULL DEFAULT 'created'
        CHECK (
            status IN (
                'created',
                'authorized',
                'captured',
                'failed',
                'refunded'
            )
        ),

    failure_reason TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- AI Agent Runs
CREATE TABLE IF NOT EXISTS agent_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID REFERENCES users(id),
    merchant_id UUID REFERENCES merchants(id),

    agent_type VARCHAR(100) NOT NULL,

    input JSONB,
    output JSONB,

    status VARCHAR(30) NOT NULL DEFAULT 'started'
        CHECK (
            status IN (
                'started',
                'completed',
                'failed'
            )
        ),

    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Agent Actions
CREATE TABLE IF NOT EXISTS agent_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    agent_run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,

    agent_name VARCHAR(100) NOT NULL,

    action_type VARCHAR(100) NOT NULL,

    input JSONB,
    output JSONB,

    reason TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID REFERENCES users(id),
    merchant_id UUID REFERENCES merchants(id),

    actor_type VARCHAR(30) NOT NULL
        CHECK (
            actor_type IN (
                'user',
                'agent',
                'system'
            )
        ),

    actor_id VARCHAR(255),

    action VARCHAR(100) NOT NULL,

    entity_type VARCHAR(100),
    entity_id UUID,

    metadata JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);