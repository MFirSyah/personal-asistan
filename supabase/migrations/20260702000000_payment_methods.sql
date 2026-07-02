-- ====================================================================
-- PAYMENT METHODS TABLE - Track sumber dana transaksi
-- ====================================================================

CREATE TABLE IF NOT EXISTS payment_methods (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    category VARCHAR(20) NOT NULL CHECK (category IN ('cash', 'digital', 'card')),
    icon VARCHAR(10) NOT NULL DEFAULT '💳',
    color VARCHAR(20) NOT NULL DEFAULT '#6B7280',
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index untuk performa query
CREATE INDEX IF NOT EXISTS idx_payment_methods_category ON payment_methods(category);
CREATE INDEX IF NOT EXISTS idx_payment_methods_active ON payment_methods(is_active) WHERE is_active = TRUE;

-- ====================================================================
-- ADD FOREIGN KEY TO MONEY_TRACKERS
-- ====================================================================

ALTER TABLE money_trackers
ADD COLUMN IF NOT EXISTS payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL;

-- ====================================================================
-- SEED DEFAULT PAYMENT METHODS
-- ====================================================================

INSERT INTO payment_methods (name, category, icon, color, display_order) VALUES
    ('Cash', 'cash', '💵', '#4CAF50', 1),
    ('Debit Card', 'card', '💳', '#2196F3', 2),
    ('Credit Card', 'card', '💳', '#9C27B0', 3),
    ('E-Wallet', 'digital', '📱', '#FF9800', 4),
    ('Transfer Bank', 'digital', '🏦', '#607D8B', 5),
    ('QRIS', 'digital', '📲', '#E91E63', 6)
ON CONFLICT DO NOTHING;

-- ====================================================================
-- RLS POLICIES
-- ====================================================================

ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

-- Semua user bisa baca payment methods yang aktif
CREATE POLICY "Semua user bisa baca payment methods aktif" ON payment_methods
    FOR SELECT USING (is_active = TRUE);

-- ====================================================================
-- OPTIONAL: Add sample E-Wallets (can be expanded later)
-- ====================================================================

-- Table untuk menyimpan custom/user-defined payment methods (optional expansion)
CREATE TABLE IF NOT EXISTS user_payment_methods (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    payment_method_id UUID REFERENCES payment_methods(id) ON DELETE CASCADE,
    nickname VARCHAR(50),
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, payment_method_id)
);

ALTER TABLE user_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manage user payment methods sendiri" ON user_payment_methods
    FOR ALL USING (auth.uid() = user_id);

COMMENT ON TABLE payment_methods IS 'Master data untuk metode pembayaran (Cash, E-Wallet, Card, dll)';
COMMENT ON TABLE user_payment_methods IS 'Mapping user ke payment methods (untuk preferences/kustomisasi)';
COMMENT ON COLUMN money_trackers.payment_method_id IS 'Sumber dana untuk transaksi ini (nullable - backward compatible)';
