import { defineMarkSpec, defineNodeSpec, definePlugin, union, type Extension } from "prosekit/core";
import { Plugin } from "prosekit/pm/state";

function defineDiffBlockSpec(): Extension {
  return defineNodeSpec({
    name: "diffBlock",
    content: "block+",
    group: "block",
    defining: true,
    attrs: {
      diffType: { default: "unchanged" },
    },
    parseDOM: [
      {
        tag: "div[data-diff-block]",
        getAttrs(dom) {
          if (typeof dom === "string") return false;
          return {
            diffType: dom.getAttribute("data-diff-type") ?? "unchanged",
          };
        },
      },
    ],
    toDOM(node) {
      return [
        "div",
        {
          class: "diff-block",
          "data-diff-block": "",
          "data-diff-type": String(node.attrs.diffType ?? "unchanged"),
        },
        0,
      ];
    },
  });
}

function defineDiffAddedMark(): Extension {
  return defineMarkSpec({
    name: "diffAdded",
    inclusive: false,
    excludes: "diffRemoved",
    parseDOM: [{ tag: "ins[data-diff-added]" }],
    toDOM() {
      return ["ins", { class: "diff-added", "data-diff-added": "" }, 0];
    },
  });
}

function defineDiffRemovedMark(): Extension {
  return defineMarkSpec({
    name: "diffRemoved",
    inclusive: false,
    excludes: "diffAdded",
    parseDOM: [{ tag: "del[data-diff-removed]" }],
    toDOM() {
      return ["del", { class: "diff-removed", "data-diff-removed": "" }, 0];
    },
  });
}

function defineReadonly(): Extension {
  return definePlugin(() => [
    new Plugin({
      props: {
        editable: () => false,
      },
    }),
  ]);
}

function defineDiffSchemaExtension(): Extension {
  return union(defineDiffBlockSpec(), defineDiffAddedMark(), defineDiffRemovedMark());
}

export { defineDiffSchemaExtension, defineReadonly };
