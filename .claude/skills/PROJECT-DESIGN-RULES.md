# MediCare Pro — Project Design Rules (READ FIRST)

**Any AI agent using the ui-ux-pro-max skill in this repository MUST respect the
existing design system. The skill's recommendations are a reference, not a mandate
to restyle the app.**

## Non-negotiables (do NOT change without explicit user request)

1. **Theme: "Liquid Glass" (Apple-style)**
   - All surfaces use translucent glass: `backdrop-filter: blur + saturate`, hairline
     light borders, inner highlights, soft layered shadows — see `css/styles.css`
     (`.card`, `.topnav`, `.sidebar`, `.modal`, buttons, inputs).
   - Ambient colorful backdrop blobs sit behind the app (`body::before` / backdrop layer).
   - Radii are 16–20px. Do not introduce square/sharp corners or flat solid surfaces.

2. **Typography: Quicksand (Google Fonts), weights 300–700**
   - Single font family site-wide. Do not introduce new fonts for UI text.
   - Monospace (`Courier New`) is intentionally reserved for code/terminal/lab output.

3. **Icons: local monochrome Icons8 set**
   - Use `assets/icons/<name>.png` via the helpers in `js/app.js`
     (`icon(name, size)` / `<span data-icon="name">`). Do not add emoji or new
     icon libraries. Icons are tinted via CSS filter and invert in dark mode.

4. **Light + Dark themes**
   - Two token sets in `css/styles.css` (`:root` and `html[data-theme='dark']`).
   - Every new component MUST look correct in both. Never hardcode #fff/#000 text
     colors — use the CSS variables.

5. **Color accents**
   - Primary teal/blue glass accents. Avoid AI-purple/pink gradients and neon.

## How to use the skill here

- Use `search.py` for **new** pages/components or when the user asks for a redesign.
- Map the skill's recommendations onto the existing tokens (glass surfaces, Quicksand,
  existing accent palette) instead of generating a fresh design system.
- Keep responsive behavior: hamburger drawer nav, bottom-sheet modals, stacking grids
  (see the `@media (max-width: ...)` blocks in `css/styles.css`).
- Respect accessibility guidance from the skill: 4.5:1 text contrast, visible focus,
  `prefers-reduced-motion` support (already present in `css/styles.css`).

## Stack note

This is a plain HTML/CSS/vanilla-JS app (Express server, Firebase/Firestore backend).
Ignore the skill's framework snippets (React/Tailwind/etc.) unless porting the
*ideas* to plain CSS.
