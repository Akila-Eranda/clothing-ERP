/** Selected POS cashier counter — scoped per active branch. */

const POS_COUNTER_KEY = "pos_selected_counter_id";
const POS_COUNTER_BRANCH_KEY = "pos_selected_counter_branch";

function branchKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("fe_active_branch")?.trim() || "";
}

/** Returns saved counter only if it belongs to the current active branch. */
export function readPosCounterId(): string {
  if (typeof window === "undefined") return "";
  const id = localStorage.getItem(POS_COUNTER_KEY)?.trim() || "";
  if (!id) return "";
  const savedBranch = localStorage.getItem(POS_COUNTER_BRANCH_KEY)?.trim() || "";
  const current = branchKey();
  if (current && savedBranch && savedBranch !== current) return "";
  return id;
}

export function writePosCounterId(id: string): string {
  const v = id.trim();
  if (typeof window !== "undefined") {
    if (v) {
      localStorage.setItem(POS_COUNTER_KEY, v);
      const b = branchKey();
      if (b) localStorage.setItem(POS_COUNTER_BRANCH_KEY, b);
      else localStorage.removeItem(POS_COUNTER_BRANCH_KEY);
    } else {
      localStorage.removeItem(POS_COUNTER_KEY);
      localStorage.removeItem(POS_COUNTER_BRANCH_KEY);
    }
  }
  return v;
}

export function clearPosCounterId(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(POS_COUNTER_KEY);
  localStorage.removeItem(POS_COUNTER_BRANCH_KEY);
}
