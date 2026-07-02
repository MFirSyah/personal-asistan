// Payment Method Types
export interface PaymentMethod {
  id: string;
  name: string;
  category: 'cash' | 'digital' | 'card';
  icon: string;
  color: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
}

export interface UserPaymentMethod {
  id: string;
  user_id: string;
  payment_method_id: string;
  nickname: string | null;
  is_default: boolean;
  created_at: string;
}

// Money Tracker Types with Payment Method
export interface MoneyTracker {
  id: string;
  user_id: string;
  amount: number;
  type: 'income' | 'expense';
  description: string | null;
  transaction_date: string;
  payment_method_id: string | null;
  dynamic_metadata: Record<string, any>;
  created_at: string;
}

export interface MoneyTrackerWithPayment extends MoneyTracker {
  payment_method?: PaymentMethod;
}

// Search Result Types
export interface TransactionSearchResult {
  id: string;
  type: string;
  amount: number;
  description: string;
  date: string;
  category: string;
  payment_method_id?: string;
  payment_method?: PaymentMethod;
}
