/** Tenant-selectable POS screen layouts (classic = current Hexalyte UI).
 *  All layouts share pos-overlay.tsx for business logic — see pos-layout-contract.ts */

export type PosLayoutId =
  | "classic"
  | "retail-1"
  | "retail-2"
  | "retail-3"
  | "retail-4"
  | "retail-5";

export type PosLayoutCategoryMode = "horizontal" | "vertical" | "compact";
export type PosLayoutCardVariant = "classic" | "image-top" | "square";
export type PosLayoutCartStyle = "rows" | "table";
export type PosLayoutCartHeader = "cart" | "order-list";
export type PosLayoutPayButtons = "split" | "stacked";

export type PosLayoutUi = {
  categoryMode: PosLayoutCategoryMode;
  cardVariant: PosLayoutCardVariant;
  cartStyle: PosLayoutCartStyle;
  cartHeader: PosLayoutCartHeader;
  payButtons: PosLayoutPayButtons;
  /** Wider checkout bill column (retail wide-cart layouts) */
  checkoutWide: boolean;
  /** Retail purchased-theme shell (order list, action grid, category pills) */
  retailUi: boolean;
};

export type PosLayoutMeta = {
  id: PosLayoutId;
  label: string;
  description: string;
  /** Maps to retail theme file (pos.tsx … pos5.tsx) */
  templateRef: string;
  ready: boolean;
};

export const POS_LAYOUT_DEFAULT: PosLayoutId = "classic";

export const POS_LAYOUT_OPTIONS: readonly PosLayoutMeta[] = [
  {
    id: "classic",
    label: "Classic (Hexalyte)",
    description: "Default POS — sidebar, product grid, resizable cart. All checkout & hold features.",
    templateRef: "hexalyte",
    ready: true,
  },
  {
    id: "retail-1",
    label: "Retail 1 — Category rail",
    description: "Vertical category tabs, table cart. Full POS: hold, checkout, GRN, returns, reports + feature bar.",
    templateRef: "pos.tsx → pos-five",
    ready: true,
  },
  {
    id: "retail-2",
    label: "Retail 2 — Standard",
    description: "Horizontal categories, classic cart rows. Slightly narrower cart panel.",
    templateRef: "pos2.tsx",
    ready: true,
  },
  {
    id: "retail-3",
    label: "Retail 3 — Cart left",
    description: "Cart panel on the left, products on the right. Same features as Classic.",
    templateRef: "pos3.tsx → pos-two",
    ready: true,
  },
  {
    id: "retail-4",
    label: "Retail 4 — Image cards",
    description: "Large image-top product cards, table cart, denser product grid.",
    templateRef: "pos4.tsx → pos-three",
    ready: true,
  },
  {
    id: "retail-5",
    label: "Retail 5 — Wide cart",
    description: "50/50 cart + products, square cards, wide checkout bill.",
    templateRef: "pos5.tsx → pos-three pos-four",
    ready: true,
  },
] as const;

const VALID = new Set<string>(POS_LAYOUT_OPTIONS.map((o) => o.id));

export function normalizePosLayoutId(value: unknown): PosLayoutId {
  if (typeof value === "string" && VALID.has(value)) return value as PosLayoutId;
  return POS_LAYOUT_DEFAULT;
}

export function getPosLayoutMeta(id: PosLayoutId): PosLayoutMeta {
  return POS_LAYOUT_OPTIONS.find((o) => o.id === id) ?? POS_LAYOUT_OPTIONS[0]!;
}

const CLASSIC_UI: PosLayoutUi = {
  categoryMode: "horizontal",
  cardVariant: "classic",
  cartStyle: "rows",
  cartHeader: "cart",
  payButtons: "split",
  checkoutWide: false,
  retailUi: false,
};

/** UI structure per layout — same data/actions, different shell. */
const RETAIL_TABLE_CART: PosLayoutUi = {
  categoryMode: "horizontal",
  cardVariant: "classic",
  cartStyle: "table",
  cartHeader: "order-list",
  payButtons: "stacked",
  checkoutWide: false,
  retailUi: true,
};

const RETAIL_CLASSIC_CART: PosLayoutUi = {
  ...CLASSIC_UI,
  retailUi: true,
};

export function getPosLayoutUi(id: PosLayoutId): PosLayoutUi {
  switch (id) {
    case "retail-1":
      return { ...RETAIL_TABLE_CART, categoryMode: "vertical", cardVariant: "classic" };
    case "retail-2":
      return { ...RETAIL_CLASSIC_CART };
    case "retail-3":
      return { ...RETAIL_CLASSIC_CART };
    case "retail-4":
      return { ...RETAIL_TABLE_CART, categoryMode: "compact", cardVariant: "image-top" };
    case "retail-5":
      return {
        ...RETAIL_TABLE_CART,
        categoryMode: "horizontal",
        cardVariant: "square",
        checkoutWide: true,
      };
    default:
      return { ...CLASSIC_UI };
  }
}
