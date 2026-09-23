export interface Customer {
  _id: string;
  name: string;
  company: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  lastPurchaseAt: string | null;
  /** Paid (not cancelled) bills only. */
  invoiceCount: number;
  totalSpent: number;
}

export interface CustomerDetails {
  name: string;
  company?: string;
  address?: string;
  phone?: string;
  email?: string;
  gstin?: string;
}
