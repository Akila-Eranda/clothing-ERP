export type SaleCompleteScanKeyResult = {
  buffer: string;
  shouldNotify: boolean;
};

export function captureSaleCompleteScanKey(
  buffer: string,
  key: string,
  deltaMs: number,
  hasModifier: boolean,
): SaleCompleteScanKeyResult {
  if (key === "Enter") {
    return { buffer: "", shouldNotify: buffer.trim().length >= 3 };
  }
  if (key.length === 1 && !hasModifier) {
    if (deltaMs < 60) return { buffer: buffer + key, shouldNotify: false };
    return { buffer: key, shouldNotify: false };
  }
  if (deltaMs >= 60) {
    return { buffer: "", shouldNotify: false };
  }
  return { buffer, shouldNotify: false };
}
