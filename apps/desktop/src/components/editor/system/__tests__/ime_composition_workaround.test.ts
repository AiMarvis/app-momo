// @vitest-environment jsdom

import type { EditorView } from "prosekit/pm/view";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  installBrokenWebKitInputGuard,
  installCompositionSelectionGuard,
} from "../ime_composition_workaround";

interface FakeInternalView {
  dom: HTMLElement;
  composing: boolean;
  docView?: {
    setSelection?: (this: unknown, ...args: unknown[]) => void;
  } | null;
}

function createFakeView(composing = false): EditorView {
  const dom = document.createElement("div");
  document.body.appendChild(dom);
  return { dom, composing } as unknown as EditorView;
}

function toInternalView(view: EditorView): FakeInternalView {
  return view as unknown as FakeInternalView;
}

function createCompositionEvent(type: "compositionstart" | "compositionend"): CompositionEvent {
  return new CompositionEvent(type, { bubbles: true, cancelable: true });
}

function createBeforeInputEvent(params: {
  inputType: string;
  data?: string;
  isComposing?: boolean;
}): InputEvent {
  return new InputEvent("beforeinput", {
    bubbles: true,
    cancelable: true,
    data: params.data ?? null,
    inputType: params.inputType,
    isComposing: params.isComposing ?? false,
  });
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("WebKit IME composition workaround", () => {
  it("blocks broken composition text events and lets the final commit through", () => {
    const view = createFakeView(true);
    const internalView = toInternalView(view);
    const cleanup = installBrokenWebKitInputGuard(view);
    const lateBeforeInputListener = vi.fn();
    let compositionEndCount = 0;

    internalView.dom.addEventListener("beforeinput", lateBeforeInputListener);
    internalView.dom.addEventListener("compositionend", () => {
      compositionEndCount += 1;
    });

    // Regression sequence from affected WebKit builds: a composition update
    // arrives before compositionstart, then another update is sent after a
    // redundant compositionstart. Both interim updates must be cancelled.
    const invalidFirstUpdate = createBeforeInputEvent({
      inputType: "insertCompositionText",
      data: "ㄱ",
      isComposing: true,
    });
    internalView.dom.dispatchEvent(invalidFirstUpdate);

    expect(invalidFirstUpdate.defaultPrevented).toBe(true);
    expect(lateBeforeInputListener).not.toHaveBeenCalled();

    internalView.dom.dispatchEvent(createCompositionEvent("compositionstart"));

    const duplicateUpdate = createBeforeInputEvent({
      inputType: "insertCompositionText",
      data: "ㄱ",
      isComposing: true,
    });
    internalView.dom.dispatchEvent(duplicateUpdate);

    expect(duplicateUpdate.defaultPrevented).toBe(true);
    expect(lateBeforeInputListener).not.toHaveBeenCalled();

    // The final non-composing commit still reaches ProseMirror. It also
    // synthesizes compositionend when ProseMirror is still stuck composing.
    const commit = createBeforeInputEvent({
      inputType: "insertText",
      data: "ㄱ",
      isComposing: false,
    });
    internalView.dom.dispatchEvent(commit);

    expect(commit.defaultPrevented).toBe(false);
    expect(lateBeforeInputListener).toHaveBeenCalledTimes(1);
    expect(compositionEndCount).toBe(1);

    cleanup();
  });

  it("leaves normal composition updates alone", () => {
    const view = createFakeView(false);
    const internalView = toInternalView(view);
    const cleanup = installBrokenWebKitInputGuard(view);
    let compositionEndCount = 0;

    internalView.dom.addEventListener("compositionend", () => {
      compositionEndCount += 1;
    });

    internalView.dom.dispatchEvent(createCompositionEvent("compositionstart"));

    const update = createBeforeInputEvent({
      inputType: "insertCompositionText",
      data: "ㅎ",
      isComposing: true,
    });
    internalView.dom.dispatchEvent(update);

    expect(update.defaultPrevented).toBe(false);

    const commit = createBeforeInputEvent({
      inputType: "insertText",
      data: "한",
      isComposing: false,
    });
    internalView.dom.dispatchEvent(commit);

    expect(commit.defaultPrevented).toBe(false);
    expect(compositionEndCount).toBe(0);

    cleanup();
  });

  it("suppresses ProseMirror DOM selection resets while composing", () => {
    const view = createFakeView(true);
    const internalView = toInternalView(view);
    const initialSetSelection = vi.fn();
    const initialDocView = { setSelection: initialSetSelection };

    internalView.docView = initialDocView;

    const cleanup = installCompositionSelectionGuard(view);

    // ProseMirror may try to mirror its state selection back to the DOM while
    // the IME owns the composition range. That write is what triggers the
    // Safari/ProseMirror #944 failure mode, so it must be suppressed.
    internalView.docView?.setSelection?.(1, 1, view, false);
    expect(initialSetSelection).not.toHaveBeenCalled();

    internalView.composing = false;
    internalView.docView?.setSelection?.(1, 1, view, false);
    expect(initialSetSelection).toHaveBeenCalledTimes(1);

    const nextSetSelection = vi.fn();
    const nextDocView = { setSelection: nextSetSelection };
    internalView.docView = nextDocView;
    internalView.composing = true;
    internalView.docView?.setSelection?.(2, 2, view, false);
    expect(nextSetSelection).not.toHaveBeenCalled();

    cleanup();

    internalView.composing = true;
    internalView.docView?.setSelection?.(1, 1, view, false);
    expect(internalView.docView).toBe(nextDocView);
    expect(nextSetSelection).toHaveBeenCalledTimes(1);

    initialDocView.setSelection?.(1, 1, view, false);
    expect(initialSetSelection).toHaveBeenCalledTimes(2);
  });
});
