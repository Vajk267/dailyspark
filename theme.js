const THEME_KEY = "dailyspark-theme-v2";

function preferredTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return "dark";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    const icon = button.querySelector("i");
    const label = button.querySelector("span");
    if (icon) icon.setAttribute("data-lucide", theme === "light" ? "moon" : "sun");
    if (label) label.textContent = theme === "light" ? "Dark" : "Light";
    button.setAttribute("aria-label", theme === "light" ? "Switch to dark mode" : "Switch to light mode");
    button.setAttribute("title", theme === "light" ? "Switch to dark mode" : "Switch to light mode");
  });
  window.lucide?.createIcons?.({ attrs: { "stroke-width": 1.8 } });
}

applyTheme(preferredTheme());

window.addEventListener("DOMContentLoaded", () => {
  applyTheme(preferredTheme());
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextTheme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      applyTheme(nextTheme);
    });
  });
});
