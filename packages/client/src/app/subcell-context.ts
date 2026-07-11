/** Parent chapter context after spawning a linked sub-Cell (persists across reload). */
export interface SubCellParentContext {
  parentNamespaceId: string;
  parentCellName: string;
  parentRelayUrls: string[];
}

import { STORAGE_KEYS } from "./session-storage.js";

const KEY = STORAGE_KEYS.subcellParent;

export function saveSubCellParentContext(ctx: SubCellParentContext): void {
  localStorage.setItem(KEY, JSON.stringify(ctx));
}

export function loadSubCellParentContext(): SubCellParentContext | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SubCellParentContext;
    if (!parsed.parentNamespaceId || !parsed.parentCellName) return null;
    if (!Array.isArray(parsed.parentRelayUrls)) {
      parsed.parentRelayUrls = [];
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearSubCellParentContext(): void {
  localStorage.removeItem(KEY);
}
