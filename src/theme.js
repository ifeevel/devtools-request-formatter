(function syncDevToolsTheme() {
  const root = document.documentElement;
  const panelsApi = globalThis.chrome?.devtools?.panels;
  const systemDarkMode = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
  const hasDevToolsThemeName = typeof panelsApi?.themeName === "string";

  function applyTheme(themeName) {
    root.dataset.devtoolsTheme = themeName === "dark" ? "dark" : "default";
  }

  function applySystemTheme(event) {
    applyTheme(event?.matches ? "dark" : "default");
  }

  if (hasDevToolsThemeName) {
    applyTheme(panelsApi.themeName);
  } else {
    applySystemTheme(systemDarkMode);
  }

  if (typeof panelsApi?.setThemeChangeHandler === "function") {
    panelsApi.setThemeChangeHandler(applyTheme);
  } else if (!hasDevToolsThemeName) {
    if (typeof systemDarkMode?.addEventListener === "function") {
      systemDarkMode.addEventListener("change", applySystemTheme);
    } else if (typeof systemDarkMode?.addListener === "function") {
      systemDarkMode.addListener(applySystemTheme);
    }
  }
})();
