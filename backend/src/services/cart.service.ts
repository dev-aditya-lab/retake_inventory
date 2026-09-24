import { randomUUID } from "node:crypto";
import { redis } from "../config/redis";
import { Product } from "../models/Product.model";
import { ApiError } from "../utils/ApiError";
import { company } from "../config/company";
import { gstStateName } from "../config/gst";
import { computeInvoiceTax, type PriceMode } from "../utils/gstCalc";
import { computeNonGstTotals, nonGstPriceFor, priceListLabel } from "../utils/nonGstBill";
import type { PriceList } from "../models/NonGstBill.model";
import { lineFromProduct, productGstProblems, resolveBuyer, type BuyerContext } from "./gstDocument.service";
import type { CartCustomer, CartData, CartGst, PaymentMethod } from "../types/cart";

// Draft carts are ephemeral working state (not yet a real sale) — Redis is
// the right store: fast, and TTL-based expiry cleans up abandoned carts
// automatically without a background job.
const CART_TTL_SECONDS = 24 * 60 * 60;

function cartKey(id: string): string {
  return `cart:${id}`;
}

function userCartsKey(userId: string): string {
  return `carts:byUser:${userId}`;
}

async function saveCart(cart: CartData): Promise<void> {
  cart.updatedAt = new Date().toISOString();
  await redis.set(cartKey(cart.id), JSON.stringify(cart), "EX", CART_TTL_SECONDS);
}

export async function createCart(userId: string): Promise<CartData> {
  const now = new Date().toISOString();
  const cart: CartData = {
    id: randomUUID(),
    cashierId: userId,
    customer: {},
    items: [],
    isB2b: false,
    gstApplicable: true,
    gst: { enabled: false, percentage: 0 },
    otherCharges: 0,
    createdAt: now,
    updatedAt: now,
  };
  await saveCart(cart);
  await redis.sadd(userCartsKey(userId), cart.id);
  await redis.expire(userCartsKey(userId), CART_TTL_SECONDS);
  return cart;
}

export async function listCarts(userId: string): Promise<CartData[]> {
  const ids = await redis.smembers(userCartsKey(userId));
  if (ids.length === 0) return [];

  const raw = await redis.mget(ids.map(cartKey));
  const carts: CartData[] = [];
  const staleIds: string[] = [];

  raw.forEach((value, i) => {
    if (value) {
      carts.push(JSON.parse(value) as CartData);
    } else {
      staleIds.push(ids[i]!);
    }
  });

  if (staleIds.length > 0) {
    await redis.srem(userCartsKey(userId), ...staleIds);
  }

  return carts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getCart(userId: string, id: string): Promise<CartData> {
  const raw = await redis.get(cartKey(id));
  if (!raw) throw ApiError.notFound("Cart not found or expired");
  const cart = JSON.parse(raw) as CartData;
  if (cart.cashierId !== userId) throw ApiError.forbidden("This cart belongs to another cashier");
  return cart;
}

/** A cart made before the checkboxes existed has neither flag: retail prices, GST bill. */
export const cartPriceMode = (cart: CartData): PriceMode => (cart.isB2b ? "exclusive" : "inclusive");
export const cartPriceList = (cart: CartData): PriceList => (cart.isB2b ? "b2b" : "retail");
export const isNonGstCart = (cart: CartData): boolean => cart.gstApplicable === false;

export interface UpdateCartInput {
  customer?: CartCustomer;
  isB2b?: boolean;
  gstApplicable?: boolean;
  gst?: CartGst;
  otherCharges?: number;
  paymentMethod?: PaymentMethod;
  note?: string;
}

export async function updateCartDetails(userId: string, id: string, updates: UpdateCartInput): Promise<CartData> {
  const cart = await getCart(userId, id);
  Object.assign(cart, updates);
  await saveCart(cart);
  return cart;
}

export async function addItem(
  userId: string,
  id: string,
  input: { productId?: string; ean13?: string; quantity: number },
): Promise<CartData> {
  const cart = await getCart(userId, id);

  const product = input.productId
    ? await Product.findById(input.productId)
    : await Product.findOne({ ean13: input.ean13 });

  if (!product || !product.isActive) {
    throw ApiError.notFound("Product not found");
  }

  const existing = cart.items.find((item) => item.productId === product.id);
  if (existing) {
    existing.quantity += input.quantity;
  } else {
    cart.items.push({
      productId: product.id,
      name: product.name,
      sku: product.sku,
      hsnCode: product.hsnCode,
      unitPrice: product.sellingPrice,
      quantity: input.quantity,
    });
  }

  await saveCart(cart);
  return cart;
}

export async function updateItemQuantity(
  userId: string,
  id: string,
  productId: string,
  quantity: number,
): Promise<CartData> {
  const cart = await getCart(userId, id);
  const item = cart.items.find((i) => i.productId === productId);
  if (!item) throw ApiError.notFound("Item not in cart");

  if (quantity <= 0) {
    cart.items = cart.items.filter((i) => i.productId !== productId);
  } else {
    item.quantity = quantity;
  }

  await saveCart(cart);
  return cart;
}

export async function removeItem(userId: string, id: string, productId: string): Promise<CartData> {
  const cart = await getCart(userId, id);
  cart.items = cart.items.filter((i) => i.productId !== productId);
  await saveCart(cart);
  return cart;
}

export async function discardCart(userId: string, id: string): Promise<void> {
  await getCart(userId, id); // ownership check — throws if not found/not yours
  await redis.del(cartKey(id));
  await redis.srem(userCartsKey(userId), id);
}

/**
 * What the bill will look like if checked out now: B2B or retail pricing,
 * place of supply, each line's price and tax, the totals, and anything that
 * would stop checkout (a bad GSTIN, a product missing its HSN/MRP…). Uses the
 * same rules as checkout, so the counter screen always matches the invoice.
 */
export async function previewCart(cart: CartData) {
  if (isNonGstCart(cart)) return previewNonGstCart(cart);

  const problems: string[] = [];
  const priceMode = cartPriceMode(cart);

  let buyer: BuyerContext;
  try {
    buyer = resolveBuyer(cart.customer, priceMode);
  } catch (err) {
    problems.push(err instanceof ApiError ? err.message : "Check the customer details");
    buyer = {
      buyerType: "B2C",
      gstin: "",
      priceMode,
      placeOfSupply: { code: company.stateCode, name: gstStateName(company.stateCode) },
      supplyType: "intra",
    };
  }

  const products = await Product.find({ _id: { $in: cart.items.map((i) => i.productId) } }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const lines = [];
  for (const item of cart.items) {
    const product = byId.get(item.productId);
    if (!product) {
      problems.push(`"${item.name}" no longer exists — remove it`);
      continue;
    }
    const missing = productGstProblems(product, buyer.priceMode);
    if (missing.length > 0) {
      problems.push(`"${product.name}" needs its ${missing.join(", ")} set before it can be billed`);
      continue;
    }
    lines.push(lineFromProduct(product, item.quantity, buyer.priceMode));
  }

  const tax = lines.length > 0
    ? computeInvoiceTax({ lines, priceMode: buyer.priceMode, supplyType: buyer.supplyType, otherCharges: cart.otherCharges })
    : null;

  return {
    gstApplicable: true as const,
    buyerType: buyer.buyerType,
    priceMode: buyer.priceMode,
    placeOfSupply: buyer.placeOfSupply,
    supplyType: buyer.supplyType,
    lines: tax?.lines.map((l) => ({
      productId: l.product,
      unitPrice: l.unitPrice,
      gstRate: l.gstRate,
      taxableValue: l.taxableValue,
      cgst: l.cgst,
      sgst: l.sgst,
      igst: l.igst,
      total: l.total,
    })) ?? [],
    otherCharges: tax?.otherCharges ?? null,
    rateSummary: tax?.rateSummary ?? [],
    taxableValue: tax?.taxableValue ?? 0,
    cgst: tax?.cgst ?? 0,
    sgst: tax?.sgst ?? 0,
    igst: tax?.igst ?? 0,
    totalTax: tax?.totalTax ?? 0,
    grandTotal: tax?.grandTotal ?? 0,
    problems,
  };
}

/**
 * The preview of a non-GST cart: each line at the chosen price list, no tax,
 * plus anything that would stop checkout. Same rules as non-GST checkout.
 */
async function previewNonGstCart(cart: CartData) {
  const problems: string[] = [];
  const priceList = cartPriceList(cart);

  const products = await Product.find({ _id: { $in: cart.items.map((i) => i.productId) } }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const lines = [];
  for (const item of cart.items) {
    const product = byId.get(item.productId);
    if (!product) {
      problems.push(`"${item.name}" no longer exists — remove it`);
      continue;
    }
    const unitPrice = nonGstPriceFor(product, priceList);
    if (unitPrice === null) {
      problems.push(`"${product.name}" needs its ${priceListLabel(priceList)} set before it can be billed`);
      continue;
    }
    lines.push({ product: String(product._id), name: product.name, quantity: item.quantity, unitPrice });
  }

  const totals = lines.length > 0 ? computeNonGstTotals(lines, cart.otherCharges) : null;

  return {
    gstApplicable: false as const,
    priceList,
    lines: totals?.lines.map((l) => ({ productId: l.product, unitPrice: l.unitPrice, total: l.total })) ?? [],
    otherCharges: totals?.otherCharges ?? 0,
    subtotal: totals?.subtotal ?? 0,
    grandTotal: totals?.grandTotal ?? 0,
    problems,
  };
}

export async function withPreview(cart: CartData) {
  return { ...cart, preview: await previewCart(cart) };
}
