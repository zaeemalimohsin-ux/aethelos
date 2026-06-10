/** Transient wizard state after spawning a sub-Cell from a parent at soft cap. */
export interface SubCellParentContext {
  parentNamespaceId: string;
  parentCellName: string;
  parentRelayUrls: string[];
}

const KEY = "aethelos-subcell-parent";

export function saveSubCellParentContext(ctx: SubCellParentContext): void {
  sessionStorage.setItem(KEY, JSON.stringify(ctx));
}

export function loadSubCellParentContext(): SubCellParentContext | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SubCellParentContext;
    if (!parsed.parentNamespaceId || !parsed.parentCellName) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSubCellParentContext(): void {
  sessionStorage.removeItem(KEY);
}
