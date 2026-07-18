import { classifyInventoryKind } from './account-mapping.helper';

describe('classifyInventoryKind', () => {
  it('classifies accessories from category', () => {
    expect(classifyInventoryKind({ categoryName: 'Phone Accessories' })).toBe('accessory');
  });

  it('classifies spare parts from line type', () => {
    expect(classifyInventoryKind({ lineType: 'PART' })).toBe('spare');
  });

  it('classifies service / labor', () => {
    expect(classifyInventoryKind({ lineType: 'LABOR' })).toBe('service');
    expect(classifyInventoryKind({ productName: 'Screen Fitting Service' })).toBe('service');
  });

  it('classifies reload commission', () => {
    expect(classifyInventoryKind({ categoryName: 'Reload / Top-up' })).toBe('reload');
  });

  it('defaults to mobile / product', () => {
    expect(classifyInventoryKind({ productName: 'iPhone 15' })).toBe('mobile');
    expect(classifyInventoryKind({})).toBe('mobile');
  });
});
