export interface GstIssue {
  level: "error" | "warning";
  message: string;
  documents?: string[];
}

export interface SectionTotals {
  count: number;
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
}

export interface DocumentRange {
  num: number;
  from: string;
  to: string;
  totnum: number;
  cancel: number;
  net_issue: number;
}

export interface Gstr1Report {
  issues: GstIssue[];
  periods: { period: string; label: string; filed: boolean }[];
  counts: { invoices: number; legacyInvoices: number; creditNotes: number };
  placeOfSupplyNames: Record<string, string>;
  summary: {
    filingPeriod: string;
    sections: {
      b2b: SectionTotals;
      b2cl: SectionTotals;
      b2cs: SectionTotals;
      cdnr: SectionTotals;
      cdnur: SectionTotals;
      b2csReturns: SectionTotals;
    };
    cancelledInvoices: number;
    hsnRows: { b2b: number; b2c: number };
    documentRanges: { invoices: DocumentRange[]; creditNotes: DocumentRange[] };
  };
  gstr3b: {
    outwardTaxable: { taxableValue: number; igst: number; cgst: number; sgst: number; cess: number };
    interStateUnregistered: { pos: string; taxableValue: number; igst: number }[];
    totalTaxLiability: number;
  };
}

export type ProductGstProblem = "hsn" | "rate" | "uqc" | "mrp" | "b2bPrice";

export interface ReadinessProduct {
  _id: string;
  name: string;
  type: string;
  weightLabel: string;
  sku: string;
  category: string;
  hsnCode?: string;
  gstRate?: number;
  uqc?: string;
  mrp?: number;
  sellingPrice?: number;
  problems: ProductGstProblem[];
}

export interface GstReadiness {
  supplier: { legalName: string; gstin: string; stateCode: string; stateName: string; issues: GstIssue[] };
  products: {
    active: number;
    missingHsn: number;
    missingRate: number;
    badUqc: number;
    missingMrp: number;
    missingB2bPrice: number;
    needsWork: ReadinessProduct[];
  };
  hsnCodes: { code: string; description: string; gstRate: number | null }[];
  months: { period: string; label: string; invoices: number; filed: boolean; isCurrent: boolean }[];
}

export interface GstFiling {
  _id: string;
  period: string;
  filedAt: string;
  filedBy?: { name: string };
  arn: string;
}
