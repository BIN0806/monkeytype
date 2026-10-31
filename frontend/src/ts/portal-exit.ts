// Register before Monkeytype's own Escape handler while running in the portal.
if (window.parent !== window) {
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const parentOrigin = document.referrer
        ? new URL(document.referrer).origin
        : "*";
      window.parent.postMessage("dungeon-practice:exit-command", parentOrigin);
    },
    true,
  );
}
