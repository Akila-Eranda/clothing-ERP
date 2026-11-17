import {
  parseScaleBarcode,
  sameScalePrice,
  sameScaleQuantity,
  scaleBarcodeMatchesKnownKeys,
  scaleBarcodeQuantity,
  resolveScaleBarcodeMode,
} from './pos-scale-barcode.helper';

describe('POS scale barcode validation', () => {
  it('accepts a check-digit-valid EAN-13 and rejects an invalid check digit', () => {
    const valid = parseScaleBarcode('2001234002509');
    expect(valid).not.toBeNull();
    expect(parseScaleBarcode('2001234002508')).toBeNull();
    expect(parseScaleBarcode('200123400250')).toBeNull();
  });

  it('matches encoded PLU keys against the selected catalog item', () => {
    const scale = parseScaleBarcode('2001234002509');
    expect(scale).not.toBeNull();
    expect(scaleBarcodeMatchesKnownKeys(scale!, ['01234'])).toBe(true);
    expect(scaleBarcodeMatchesKnownKeys(scale!, ['00999'])).toBe(false);
  });

  it('derives weight from either embedded weight or embedded price', () => {
    const weight = parseScaleBarcode('2001234000505');
    const price = parseScaleBarcode('2001234003001');
    const unrepresentablePrice = parseScaleBarcode('2001234002509');
    expect(weight && scaleBarcodeQuantity(weight, 1000)).toBe(0.05);
    expect(price && scaleBarcodeQuantity(price, 1000)).toBe(0.003);
    expect(unrepresentablePrice && scaleBarcodeQuantity(unrepresentablePrice, 1000)).toBeNull();
    expect(price && scaleBarcodeQuantity(price, 0)).toBeNull();
  });

  it('compares scale quantity and catalog price with bounded precision', () => {
    expect(sameScaleQuantity(0.25, 0.2504)).toBe(true);
    expect(sameScaleQuantity(0.25, 0.251)).toBe(false);
    expect(sameScalePrice(100, 100.01)).toBe(true);
    expect(sameScalePrice(100, 100.02)).toBe(false);
  });

  describe('per-shop interpretation mode (P-F3)', () => {
    const ean = (plu5: string, value5: string) => {
      const twelve = `2${'0'}${plu5}${value5}`.slice(0, 12);
      const sum = twelve.split('').map(Number).reduce((x, d, i) => x + d * (i % 2 === 0 ? 1 : 3), 0);
      return `${twelve}${(10 - (sum % 10)) % 10}`;
    };
    const label = (value5: string) => parseScaleBarcode(ean('01234', value5))!;

    it('unset / unknown settings keep the existing AUTO behaviour', () => {
      for (const settings of [undefined, null, {}, { pos: {} }, { pos: { scaleBarcodeMode: '' } }, { pos: { scaleBarcodeMode: 'nonsense' } }, { pos: { scaleBarcodeMode: 7 } }]) {
        expect(resolveScaleBarcodeMode(settings)).toBe('AUTO');
      }
      expect(resolveScaleBarcodeMode({ pos: { scaleBarcodeMode: 'price' } })).toBe('PRICE');
      expect(resolveScaleBarcodeMode({ pos: { scaleBarcodeMode: ' Weight ' } })).toBe('WEIGHT');
    });

    it('AUTO is unchanged: >= 1.00 is a price, below is a weight (the known ambiguity for heavier weight labels)', () => {
      expect(scaleBarcodeQuantity(label('00050'), 1000)).toBe(0.05);              // 0.50 -> weight 50 g
      expect(scaleBarcodeQuantity(label('00300'), 1000, 'AUTO')).toBe(0.003);     // 3.00 -> price (not 300 g)
      expect(scaleBarcodeQuantity(label('00300'), 1000)).toBe(scaleBarcodeQuantity(label('00300'), 1000, 'AUTO'));
    });

    it('WEIGHT mode always reads grams', () => {
      expect(scaleBarcodeQuantity(label('00300'), 1000, 'WEIGHT')).toBe(0.3);
      expect(scaleBarcodeQuantity(label('01250'), 250, 'WEIGHT')).toBe(1.25);
      expect(scaleBarcodeQuantity(label('00000'), 250, 'WEIGHT')).toBeNull();     // zero weight is never a sale
    });

    it('PRICE mode always reads cents, and still requires an exactly representable quantity', () => {
      expect(scaleBarcodeQuantity(label('01000'), 250, 'PRICE')).toBe(0.04);      // LKR 10.00 / 250
      expect(scaleBarcodeQuantity(label('00050'), 100, 'PRICE')).toBe(0.005);     // LKR 0.50 / 100 per kg
      expect(scaleBarcodeQuantity(label('00101'), 1000, 'PRICE')).toBeNull();     // 1.01 / 1000 = 0.00101 -> not 3 dp
      expect(scaleBarcodeQuantity(label('01000'), 0, 'PRICE')).toBeNull();
    });
  });
});
