// Marks <html> while the user is tabbing; no-default-outline.css shows focus rings only then.
// Browsers match :focus-visible after any key press, so shortcuts and Escape lit up rings on auto-focused dialog buttons.
const root = document.documentElement;

window.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Tab") root.dataset.tabbing = "";
    else delete root.dataset.tabbing;
  },
  true,
);
window.addEventListener("pointerdown", () => delete root.dataset.tabbing, true);
