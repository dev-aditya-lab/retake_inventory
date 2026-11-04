export interface Customer {
  _id: string;
  name: string;
  company: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  notes?: string;
  tags?: string[];
  /** Where the entry came from: a bill, typed in by staff, or saved from a WhatsApp chat. */
  source?: "sale" | "manual" | "whatsapp";
  lastPurchaseAt: string | null;
  /** Paid (not cancelled) bills only. */
  invoiceCount: number;
  totalSpent: number;
  /** Still owed on their GST bills (advances and part-payments already taken off). */
  dueAmount?: number;
}

export interface CustomerDetails {
  name: string;
  company?: string;
  address?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  notes?: string;
  tags?: string[];
}
