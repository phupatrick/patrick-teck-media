# Homepage redesign notes

1. Framework: Node.js with plain HTML templating. `package.json` has no React, Next.js, Astro, or Tailwind runtime.
2. Homepage renderer: `src/newsroom-render.mjs`, called by `server.mjs` for `/vi/` and `/en/`.
3. Story data: `state.home[language]` is built by `src/newsroom-service.mjs` from local newsroom data and optional external/Neon-backed documents.
4. Bilingual handling: `normalizeRenderCopy(language)` in `src/newsroom-render.mjs` supplies Vietnamese and English copy objects; story fields are localized in the service layer.
5. Design tokens: `public/site.css` contains the global `:root` variables and all shared styles.
6. Tailwind: not used. Tokens remain native CSS variables.
7. Fonts: `renderLayout()` loads Google Fonts with a stylesheet link; the current project uses Be Vietnam Pro. The redesign adds Fraunces and Inter through the same existing loading method.

Reference note: `patricktechmedia-redesign.html` was not present in the repository, so the implementation follows the supplied class/structure specification and reuses real newsroom data and existing routes.
