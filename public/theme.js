(() => {
  const THEME_KEY = "narada.theme";

  /**
   * Theme stored in the browser, or the OS preference, or dark.
   *
   * @returns {"light" | "dark"}
   */
  function resolveTheme() {
    const saved = readSavedTheme();
    if (saved) {
      return saved;
    }

    try {
      return window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
    } catch {
      return "dark";
    }
  }

  /**
   * @returns {"light" | "dark" | null}
   */
  function readSavedTheme() {
    try {
      const value = window.localStorage.getItem(THEME_KEY);
      return value === "light" || value === "dark" ? value : null;
    } catch {
      return null;
    }
  }

  /**
   * Paints the document. Pass `persist` after an explicit toggle so Attention
   * and Merchants share the choice; first visit can still follow the OS.
   *
   * @param {"light" | "dark"} theme
   * @param {boolean} [persist]
   */
  function applyTheme(theme, persist = false) {
    const next = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);

    if (persist) {
      try {
        window.localStorage.setItem(THEME_KEY, next);
      } catch {
        // Private mode or quota — theme still applies for this visit.
      }
    }

    syncThemeToggle(next);
  }

  /**
   * @param {"light" | "dark"} theme
   */
  function syncThemeToggle(theme) {
    const button = document.getElementById("theme-toggle");
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const next = theme === "light" ? "dark" : "light";
    button.textContent = next === "light" ? "Light" : "Dark";
    button.setAttribute("aria-label", `Use ${next} theme`);
    button.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
  }

  /**
   * Wires the header theme button after the page is ready.
   */
  function bindThemeToggle() {
    const button = document.getElementById("theme-toggle");
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    button.addEventListener("click", () => {
      const current =
        document.documentElement.getAttribute("data-theme") === "light"
          ? "light"
          : "dark";
      applyTheme(current === "light" ? "dark" : "light", true);
    });
  }

  applyTheme(resolveTheme());
  bindThemeToggle();
})();
