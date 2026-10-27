import { PRODUCTS } from './catalog'
import { PricingError } from './errors'
import { FREE_SHIPPING_THRESHOLD_CENTS, MAX_QUANTITY, SHIPPING_COST_CENTS, normalizeCouponCode } from './rules'
import type { CartItem, PriceBreakdown, Product } from './types'

type Coupon = 'SAVE10' | 'FREESHIP' | null

function isValidQuantity(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity > 0 && quantity <= MAX_QUANTITY
}

function calculateLineCents(item: CartItem, catalog: readonly Product[]): number {
  if (!isValidQuantity(item.quantity)) {
    throw new PricingError('INVALID_QUANTITY', 'La cantidad debe ser un entero entre 1 y ' + MAX_QUANTITY + '.')
  }
  const product = catalog.find((candidate) => candidate.id === item.productId)
  if (!product) {
    throw new PricingError('UNKNOWN_PRODUCT', 'El producto "' + item.productId + '" no existe.')
  }
  return product.priceCents * item.quantity
}

function calculateSubtotal(items: CartItem[], catalog: readonly Product[]): number {
  return items.reduce((sum, item) => sum + calculateLineCents(item, catalog), 0)
}

function parseCoupon(couponCode?: string | null): Coupon {
  if (couponCode === undefined || couponCode === null) return null
  const normalized = normalizeCouponCode(couponCode)
  if (normalized === '') return null
  if (normalized === 'SAVE10') return 'SAVE10'
  if (normalized === 'FREESHIP') return 'FREESHIP'
  throw new PricingError('INVALID_COUPON', 'El cupón "' + couponCode.trim() + '" no es válido.')
}

function calculateDiscount(subtotalCents: number, coupon: Coupon): number {
  if (coupon !== 'SAVE10') return 0
  // 10% del subtotal, redondeado al centavo más cercano (mitades hacia arriba).
  return Math.floor((subtotalCents * 10 + 50) / 100)
}

function calculateShipping(subtotalCents: number, discountCents: number, coupon: Coupon): number {
  if (subtotalCents === 0 || coupon === 'FREESHIP') return 0
  return subtotalCents - discountCents >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : SHIPPING_COST_CENTS
}

function calculateTotal(subtotalCents: number, discountCents: number, shippingCents: number): number {
  return subtotalCents - discountCents + shippingCents
}

export function calculatePricing(
  items: CartItem[],
  couponCode?: string | null,
  catalog: readonly Product[] = PRODUCTS,
): PriceBreakdown {
  const subtotalCents = calculateSubtotal(items, catalog)
  const coupon = parseCoupon(couponCode)
  const discountCents = calculateDiscount(subtotalCents, coupon)
  const shippingCents = calculateShipping(subtotalCents, discountCents, coupon)

  return {
    subtotalCents,
    discountCents,
    shippingCents,
    totalCents: calculateTotal(subtotalCents, discountCents, shippingCents),
  }
}