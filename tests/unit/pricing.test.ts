import { describe, expect, it } from 'vitest'
import { calculatePricing } from '../../shared/pricing'
import type { Product } from '../../shared/types'
import { KEYBOARD, MOUSE, SLEEVE, errorCodeOf, line } from './helpers'

// Estas pruebas solo conocen la "puerta de entrada" calculatePricing(): entradas -> importes.
// No saben cómo está escrita por dentro, por eso siguen pasando después de refactorizar.
// Todos los importes están en centavos: $60.00 = 6000.

describe('calculatePricing', () => {
  describe('subtotal', () => {
    it('suma precio × cantidad de varios productos distintos', () => {
      // 1 × $30.00 + 2 × $25.00 + 1 × $60.00 = $140.00
      const pricing = calculatePricing([line(SLEEVE, 1), line(MOUSE, 2), line(KEYBOARD, 1)])

      expect(pricing.subtotalCents).toBe(14000)
    })
  })

  describe('descuento con cupón SAVE10', () => {
    it('descuenta el 10% del subtotal (2 Laptop Sleeve = $60.00 → -$6.00), sin importar mayúsculas ni espacios', () => {
      expect(calculatePricing([line(SLEEVE, 2)], 'SAVE10').discountCents).toBe(600)
      expect(calculatePricing([line(SLEEVE, 2)], '  save10 ').discountCents).toBe(600)
    })

    it('redondea el descuento al centavo más cercano, con las mitades hacia arriba', () => {
      // Producto de 1 centavo: la cantidad coincide con el subtotal en centavos.
      const oneCent: Product[] = [{ id: 'cent', name: 'Centavo', priceCents: 1 }]
      const discountFor = (subtotalCents: number) =>
        calculatePricing([line('cent', subtotalCents)], 'SAVE10', oneCent).discountCents

      expect(discountFor(4)).toBe(0) // 0.4 → 0
      expect(discountFor(5)).toBe(1) // 0.5 → 1 (mitad hacia arriba)
      expect(discountFor(14)).toBe(1) // 1.4 → 1
      expect(discountFor(15)).toBe(2) // 1.5 → 2 (mitad hacia arriba)
      expect(discountFor(99)).toBe(10) // 9.9 → 10
    })

    it('SAVE10 sobre 1 de cada producto ($115.00) descuenta $11.50 y conserva el envío gratis porque queda en $103.50', () => {
      // $30.00 + $25.00 + $60.00 = $115.00 → 10% = $11.50 → $103.50 sigue siendo ≥ $100.00
      const pricing = calculatePricing([line(SLEEVE, 1), line(MOUSE, 1), line(KEYBOARD, 1)], 'SAVE10')

      expect(pricing.subtotalCents).toBe(11500)
      expect(pricing.discountCents).toBe(1150)
      expect(pricing.shippingCents).toBe(0)
      expect(pricing.totalCents).toBe(10350)
    })

    it('rechaza cupones inexistentes y no permite combinar cupones en un solo código', () => {
      expect(errorCodeOf(() => calculatePricing([line(SLEEVE, 1)], 'DESCUENTO50'))).toBe('INVALID_COUPON')
      expect(errorCodeOf(() => calculatePricing([line(SLEEVE, 1)], 'SAVE10 FREESHIP'))).toBe('INVALID_COUPON')
      expect(errorCodeOf(() => calculatePricing([line(SLEEVE, 1)], 'SAVE10,FREESHIP'))).toBe('INVALID_COUPON')
    })
  })

  describe('envío', () => {
    it('cobra $5.00 cuando el subtotal es menor a $100.00 y no hay cupón', () => {
      const pricing = calculatePricing([line(SLEEVE, 1)])

      expect(pricing.shippingCents).toBe(500)
      expect(pricing.discountCents).toBe(0)
      expect(pricing.totalCents).toBe(3500)
    })

    it('es gratis exactamente desde $100.00 y se cobra en $99.99 (valor límite)', () => {
      const catalog: Product[] = [
        { id: 'just-below', name: 'Justo debajo', priceCents: 9999 },
        { id: 'exact', name: 'Justo en el umbral', priceCents: 10000 },
      ]

      expect(calculatePricing([line('just-below', 1)], null, catalog).shippingCents).toBe(500)
      expect(calculatePricing([line('exact', 1)], null, catalog).shippingCents).toBe(0)
    })

    it('FREESHIP elimina el envío sin otorgar descuento', () => {
      const pricing = calculatePricing([line(MOUSE, 1)], 'FREESHIP')

      expect(pricing.shippingCents).toBe(0)
      expect(pricing.discountCents).toBe(0)
      expect(pricing.totalCents).toBe(2500)
    })

    it('evalúa el umbral de envío gratis DESPUÉS de aplicar el descuento', () => {
      // 2 × $30.00 + 2 × $25.00 = $110.00
      const cart = [line(SLEEVE, 2), line(MOUSE, 2)]

      // Sin cupón llega a $100.00 → envío gratis.
      expect(calculatePricing(cart).shippingCents).toBe(0)
      // Con SAVE10 baja a $99.00 → ya no llega al umbral → se cobra el envío.
      const withCoupon = calculatePricing(cart, 'SAVE10')
      expect(withCoupon.shippingCents).toBe(500)
      expect(withCoupon.totalCents).toBe(10400)
    })
  })

  describe('total', () => {
    it('total = subtotal − descuento + envío (ejemplo del enunciado: $59.00)', () => {
      expect(calculatePricing([line(SLEEVE, 2)], 'SAVE10')).toEqual({
        subtotalCents: 6000,
        discountCents: 600,
        shippingCents: 500,
        totalCents: 5900,
      })
    })
  })

  describe('carrito vacío', () => {
    it('no tiene importes ni cobra envío, con o sin cupón', () => {
      const zero = { subtotalCents: 0, discountCents: 0, shippingCents: 0, totalCents: 0 }

      expect(calculatePricing([])).toEqual(zero)
      expect(calculatePricing([], 'SAVE10')).toEqual(zero)
      expect(calculatePricing([], 'FREESHIP')).toEqual(zero)
    })
  })

  describe('validación de entradas', () => {
    it('solo acepta cantidades enteras entre 1 y 99', () => {
      for (const invalid of [0, -1, 1.5, Number.NaN, 100]) {
        expect(errorCodeOf(() => calculatePricing([line(MOUSE, invalid)]))).toBe('INVALID_QUANTITY')
      }
      // Valores límite válidos
      expect(calculatePricing([line(MOUSE, 1)]).subtotalCents).toBe(2500)
      expect(calculatePricing([line(MOUSE, 99)]).subtotalCents).toBe(247500)
    })

    it('rechaza productos que no existen en el catálogo', () => {
      expect(errorCodeOf(() => calculatePricing([line('no-existe', 1)]))).toBe('UNKNOWN_PRODUCT')
    })
  })
})
