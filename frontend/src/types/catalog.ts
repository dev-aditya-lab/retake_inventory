/** One row of the SKU code list: a spice name and the codes its products are built from. */
export interface SkuCode {
  _id: string;
  name: string;
  /** Product segment of the SKU, e.g. "TUR" in RTK-TUR-WH-025. */
  skuCode: string;
  /** PPP segment of the EAN-13, e.g. 1 -> 890 11 001 01 01. */
  productId: number;
  category: string;
  /** Products currently generated from this code. */
  productCount: number;
}

export interface HsnCode {
  _id: string;
  code: string;
  description: string;
  /** Reference GST rate (%), if set. */
  gstRate?: number;
  productCount: number;
}
