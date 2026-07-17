"use strict";
/** Shop vertical profiles — shared config for CLOTHING, GROCERY, HARDWARE, AGRICULTURE, SPARE_PARTS, TIRE_SHOP */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHOP_TYPE_LIST = exports.SHOP_PROFILES = exports.ShopType = void 0;
exports.getShopProfile = getShopProfile;
exports.slugifyCategory = slugifyCategory;
exports.defaultVariantAttributes = defaultVariantAttributes;
var ShopType;
(function (ShopType) {
    ShopType["CLOTHING"] = "CLOTHING";
    ShopType["GROCERY"] = "GROCERY";
    ShopType["HARDWARE"] = "HARDWARE";
    ShopType["AGRICULTURE"] = "AGRICULTURE";
    ShopType["SPARE_PARTS"] = "SPARE_PARTS";
    ShopType["TIRE_SHOP"] = "TIRE_SHOP";
})(ShopType || (exports.ShopType = ShopType = {}));
exports.SHOP_PROFILES = {
    [ShopType.CLOTHING]: {
        type: ShopType.CLOTHING,
        label: 'Clothing Shop',
        labelSi: 'ඇඳුම් කඩය',
        emoji: '👕',
        description: 'Apparel, fashion, boutiques — sizes, colors, hang tags',
        defaultCategories: ["Men's Wear", "Women's Wear", "Kids' Wear", 'Accessories', 'Footwear'],
        variantAttributes: [
            { name: 'Size', presets: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], mapsTo: 'size' },
            { name: 'Color', presets: ['Black', 'White', 'Navy', 'Red', 'Blue', 'Green'], mapsTo: 'color' },
        ],
        defaultUnit: 'pcs',
        units: ['pcs'],
        modules: { brands: true, collections: true, hangTags: true, variants: true, returns: true, promotions: true, loyalty: true, expiry: false, batch: false, vehicles: false, warranty: false, quotations: false },
        labelTemplates: ['sticker', 'hangtag'],
    },
    [ShopType.GROCERY]: {
        type: ShopType.GROCERY,
        label: 'Grocery Shop',
        labelSi: 'සිල්ලර කඩය',
        emoji: '🛒',
        description: 'Supermarket, mini-mart — weight, volume, expiry tracking',
        defaultCategories: ['Fresh Produce', 'Dairy & Eggs', 'Beverages', 'Snacks', 'Frozen Foods', 'Household'],
        variantAttributes: [
            { name: 'Weight', presets: ['250g', '500g', '1kg', '2kg', '5kg'], mapsTo: 'size' },
        ],
        defaultUnit: 'kg',
        units: ['pcs', 'kg', 'g', 'L', 'ml'],
        modules: { brands: true, collections: false, hangTags: false, variants: true, returns: true, promotions: true, loyalty: false, expiry: true, batch: true, vehicles: false, warranty: false, quotations: false },
        labelTemplates: ['sticker', 'shelf'],
    },
    [ShopType.HARDWARE]: {
        type: ShopType.HARDWARE,
        label: 'Hardware Shop',
        labelSi: 'Hardware කඩය',
        emoji: '🔧',
        description: 'Tools, plumbing, electrical — specs, SKU, bulk items',
        defaultCategories: ['Tools', 'Electrical', 'Plumbing', 'Paint', 'Building Materials', 'Safety Gear'],
        variantAttributes: [
            { name: 'Size', presets: ['Small', 'Medium', 'Large', '10mm', '12mm', '20mm'], mapsTo: 'size' },
            { name: 'Material', presets: ['Steel', 'Brass', 'PVC', 'Copper', 'Aluminium'], mapsTo: 'material' },
        ],
        defaultUnit: 'pcs',
        units: ['pcs', 'piece', 'kg', 'feet', 'meter', 'box', 'set', 'roll'],
        modules: { brands: true, collections: false, hangTags: false, variants: true, returns: true, promotions: false, loyalty: false, expiry: false, batch: false, vehicles: false, warranty: false, quotations: true },
        labelTemplates: ['sticker', 'shelf'],
    },
    [ShopType.AGRICULTURE]: {
        type: ShopType.AGRICULTURE,
        label: 'Agriculture Shop',
        labelSi: 'කෘෂිකර්ම කඩය',
        emoji: '🌾',
        description: 'Seeds, fertilizer, equipment — grade, batch, season',
        defaultCategories: ['Seeds', 'Fertilizer', 'Pesticides', 'Equipment', 'Animal Feed', 'Irrigation'],
        variantAttributes: [
            { name: 'Weight', presets: ['1kg', '5kg', '10kg', '25kg', '50kg'], mapsTo: 'size' },
            { name: 'Grade', presets: ['Grade A', 'Grade B', 'Premium', 'Standard'], mapsTo: 'style' },
        ],
        defaultUnit: 'kg',
        units: ['kg', 'bag', 'pcs', 'liter', 'acre'],
        modules: { brands: true, collections: false, hangTags: false, variants: true, returns: true, promotions: false, loyalty: false, expiry: true, batch: true, vehicles: false, warranty: false, quotations: false },
        labelTemplates: ['sticker', 'shelf'],
    },
    [ShopType.SPARE_PARTS]: {
        type: ShopType.SPARE_PARTS,
        label: 'Spare Parts Shop',
        labelSi: 'Spare Parts කඩය',
        emoji: '🚗',
        description: 'Auto spare parts — vehicle compatibility, warranty, quotations',
        defaultCategories: ['Engine Parts', 'Brakes & Suspension', 'Filters', 'Electrical', 'Body Parts', 'Lubricants', 'Accessories'],
        variantAttributes: [
            { name: 'OEM No', presets: [], mapsTo: 'size' },
            { name: 'Part Type', presets: ['OEM', 'Aftermarket', 'Genuine'], mapsTo: 'style' },
        ],
        defaultUnit: 'pcs',
        units: ['pcs', 'set', 'pair', 'box', 'liter'],
        modules: { brands: true, collections: false, hangTags: false, variants: true, returns: true, promotions: true, loyalty: true, expiry: false, batch: true, vehicles: true, warranty: true, quotations: true },
        labelTemplates: ['sticker', 'shelf'],
    },
    [ShopType.TIRE_SHOP]: {
        type: ShopType.TIRE_SHOP,
        label: 'Tyre Shop',
        labelSi: 'Tyre Shop',
        emoji: '🛞',
        description: 'Tyres & rims — size fitment, vehicle lookup, warranty, fleet quotations',
        defaultCategories: ['Passenger Tyres', 'SUV & 4x4 Tyres', 'Commercial Tyres', 'Rims & Wheels', 'Accessories'],
        variantAttributes: [
            { name: 'Tyre Size', presets: ['205/55R16', '195/65R15', '215/60R16', '265/65R17'], mapsTo: 'size' },
            { name: 'Season', presets: ['All Season', 'Summer', 'Winter'], mapsTo: 'style' },
        ],
        defaultUnit: 'pcs',
        units: ['pcs', 'set', 'pair', 'box'],
        modules: { brands: true, collections: false, hangTags: false, variants: true, returns: true, promotions: true, loyalty: true, expiry: false, batch: true, vehicles: true, warranty: true, quotations: true },
        labelTemplates: ['sticker', 'shelf'],
    },
};
exports.SHOP_TYPE_LIST = Object.values(exports.SHOP_PROFILES);
function getShopProfile(type) {
    const key = (type ?? ShopType.CLOTHING);
    return exports.SHOP_PROFILES[key] ?? exports.SHOP_PROFILES[ShopType.CLOTHING];
}
function slugifyCategory(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function defaultVariantAttributes(type) {
    return getShopProfile(type).variantAttributes.map((a) => ({ ...a, presets: [...a.presets] }));
}
