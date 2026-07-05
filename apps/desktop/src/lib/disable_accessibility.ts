function installAccessibilitySuppression(root: HTMLElement = document.body): () => void {
  // Keep suppression non-invasive so app startup and editor rendering are not
  // coupled to global DOM rewrites.
  root.dataset.accessibilityDisabled = "true";
  document.documentElement.dataset.accessibilityDisabled = "true";

  return () => {
    delete root.dataset.accessibilityDisabled;
    delete document.documentElement.dataset.accessibilityDisabled;
  };
}

export { installAccessibilitySuppression };
