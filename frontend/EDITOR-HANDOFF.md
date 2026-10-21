# Editor handoff

See `docs/16_Canva_Editor.md` for architecture, features, shortcuts and limits.

## Done
- Full Canva-style rebuild of Posts: top bar, rail + slide-out panels, contextual toolbar, stacked pages, zoom, grid view, context menu, shortcuts, undo/redo, autosave, Projects.
- Photo editing (adjustments, filters, crop, background remover, frames, border, corners, shadow) rendered by one pipeline for screen and export.
- Exports PNG / JPG (quality) / PDF, current page or all pages (ZIP for images, one PDF), 1x / 2x. Dimensions verified.
- Fonts: TTF, OTF, WOFF, WOFF2 upload, IndexedDB persistence, backend mirror (`/api/posts/fonts`, table `custom_fonts`, tests in `backend/tests/test_fonts.py`), cross-device restore verified.
- Kept: 3 templates, 5 aspect ratios (plus extra sizes), cutout endpoint, Instagram preview, Cloudinary upload, single + carousel publish, opinions panel (suggest, use as headline and caption).
- Removed (replaced): `CarouselCanvas`, `TemplateStrip`, `LightroomPanel`, `FramePanel`, `OpinionsPanel`, `frame.ts`, `adjustments.ts`, `treatments.ts`, `posts/templates.ts`.

## Left / not done
- Text curve effect; per-character text styling.
- Designs and uploaded photos are browser-local (IndexedDB). A backend `designs` + `assets` model would give cross-device projects.
- Real Instagram publish was not run (no credentials locally). The render + upload path is exercised and fails cleanly with the backend's "CLOUDINARY_URL is not set".
- Pointer-synthesised drag tests could not drive fabric's snapping live; snapping and guides were verified by calling the move handler directly and by real drags that moved/scaled objects.

## Requests for Kahaan
- Run one real publish (single image and a 2-slide carousel) against the Madridonomy account and tell me if Instagram rejects any size (9:16 and 3:4 are outside the feed's 4:5 to 1.91:1 range; the preview crops them like the feed).
- Decide whether to add the backend `designs` / `assets` tables for cross-device projects.
- Headline font on the templates is Arial bold to match the server's one-shot render. Say if you want Anton (already bundled) as the signature font.
- docs/CLAUDE.md still lists "no general-purpose design editor" as a non-goal; this editor supersedes it at your request.
