// FILE: src/__create/shared-design-mode-stub.ts
// Stub — shared/design-mode not needed in offline Electron build

export type GetStyleInfo = (resolved: { element: Element }) => {
  className: string;
  styles: Record<string, string> | null;
};

export function initDesignMode(_getStyleInfo: GetStyleInfo): () => void {
  return () => {};
}