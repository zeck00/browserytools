import { create } from "zustand";

/**
 * Audio-editor focus mode — shared UI state that lets the editor collapse the
 * app chrome (hide the rail, drop the content gutter, hide the tool's SEO zone)
 * so it can use the full width while KEEPING app context (the top bar stays).
 *
 * The editor stamps `:root[data-editor="on"]` from this state (see AudioStudio);
 * the rail and content-region CSS modules react to that attribute, so there's
 * no prop drilling and no SSR flash — the same zero-JS signal pattern the shell
 * already uses for `data-width`. Session-only (not persisted): reload leaves
 * the editor closed.
 */
interface EditorModeStore {
  active: boolean;
  enter: () => void;
  exit: () => void;
}

export const useEditorModeStore = create<EditorModeStore>()((set) => ({
  active: false,
  enter: () => set({ active: true }),
  exit: () => set({ active: false }),
}));
