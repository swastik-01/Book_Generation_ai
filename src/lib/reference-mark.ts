import { Mark, mergeAttributes } from "@tiptap/core";

/**
 * Inline mark that wraps a reference marker like "[1]" so the editor can
 * remember which Reference (refId) it points to and what kind of reference
 * (footnote / endnote) it is. Renders as <sup class="ref-marker" data-...>.
 */
export const ReferenceMark = Mark.create({
  name: "referenceMark",
  inclusive: false,
  spanning: false,

  addAttributes() {
    return {
      refId: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-ref-id"),
        renderHTML: (a: Record<string, unknown>) =>
          a.refId ? { "data-ref-id": String(a.refId) } : {},
      },
      label: {
        default: "",
        parseHTML: (el: HTMLElement) =>
          el.getAttribute("data-ref-label") || (el.textContent || "").replace(/[[\]]/g, "") || "",
        renderHTML: (a: Record<string, unknown>) =>
          a.label ? { "data-ref-label": String(a.label) } : {},
      },
      kind: {
        default: "footnote",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-ref-kind") || "footnote",
        renderHTML: (a: Record<string, unknown>) => ({
          "data-ref-kind": String(a.kind || "footnote"),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "sup[data-ref-id]" }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return ["sup", mergeAttributes(HTMLAttributes, { class: "ref-marker" }), 0];
  },
});
