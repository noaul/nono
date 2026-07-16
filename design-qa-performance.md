# Nono Performance Design QA

## Evidence

- Desktop implementation: `design-qa-nono-desktop.png`
- Mobile implementation: `design-qa-nono-mobile.png`
- Side-by-side comparison: `design-qa-comparison.png`
- Admin authentication state: `design-qa-nono-admin-auth.png`
- Desktop viewport: 1899 x 1026 CSS pixels.
- Mobile viewport: 355 x 767 CSS pixels.
- State: public navigation loaded with the portal enabled and the first folder batch rendered.

## Findings

- The configured background differs from the directional reference because background selection is user-controlled.
- No actionable P0, P1, or P2 findings remained in this verification run.
- The Docker browser session redirected `/admin/site` to `/login`, so authenticated production data was not captured.

## Verified Surfaces

- Typography and wrapping remained readable on desktop and mobile.
- Hero, search, tabs, and folder grid rendered without horizontal overflow.
- Glass radius, opacity, blur, and search contrast used configurable site tokens.
- Existing background and link assets rendered without placeholders.

## Performance Changes

- Added configurable portal label, URL, image, enabled state, and target behavior.
- Added configurable glass radius, opacity, and blur controls.
- Limited initial folder rendering to batches of 24 with intersection-based continuation.
- Limited top tabs to root folders and constrained the tab strip.
- Disabled live preview blur while appearance controls are actively dragged.
- Tuned sortable fallback behavior and removed repeated visual effects during dragging.

## Verification Notes

- Initial public render: 24 folders, 15 root tabs, 418 anchors.
- Desktop and mobile document widths stayed within their viewports.
- Two portal links were present.

Final result at capture time: passed.
