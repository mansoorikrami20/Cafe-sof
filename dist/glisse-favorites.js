import React from "https://esm.sh/react@19.2.0";
import { createRoot } from "https://esm.sh/react-dom@19.2.0/client";
import { Glass } from "https://esm.sh/glisse@0.6.0?deps=react@19.2.0,react-dom@19.2.0";

// Glisse is intentionally isolated to favorite buttons. The restaurant UI stays framework-free.
const favoriteGlassStyle = {
  width: "100%",
  height: "100%",
  borderRadius: 75,
  background: "none",
  "--lg-glass-bend": 1,
  "--lg-glass-dispersion": 1.05,
  "--lg-blur": "0px",
  "--lg-rim-shine": 0.59,
};

function mountFavoriteGlass(button) {
  if (!button?.isConnected || button.dataset.glisseMounted === "true") return;
  button.dataset.glisseMounted = "true";

  const host = document.createElement("span");
  host.className = "glisse-favorite-host";
  host.setAttribute("data-glisse-mounted", "true");

  const favoriteId = button.dataset.favorite;
  const pressed = button.getAttribute("aria-pressed");
  const ariaLabel = button.getAttribute("aria-label") || "Добавить в избранное";
  const className = button.className;
  const iconMarkup = button.innerHTML;

  button.replaceWith(host);
  const root = createRoot(host);
  root.render(
    React.createElement(
      Glass,
      { className: "favorite-glass", style: favoriteGlassStyle },
      React.createElement("button", {
        type: "button",
        className,
        "data-favorite": favoriteId,
        "aria-label": ariaLabel,
        ...(pressed === null ? {} : { "aria-pressed": pressed }),
        dangerouslySetInnerHTML: { __html: iconMarkup },
      })
    )
  );
}

let frame = 0;
function enhanceFavoriteButtons() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    document.querySelectorAll(".food > .heart:not([data-glisse-mounted])").forEach(mountFavoriteGlass);
  });
}

new MutationObserver(enhanceFavoriteButtons).observe(document.body, {
  childList: true,
  subtree: true,
});

enhanceFavoriteButtons();
