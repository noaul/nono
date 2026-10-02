# Appearance settings

The public homepage uses the 77 fields in `packages/web/src/utils/appearance.ts`. The typed
`APPEARANCE_FIELDS` table supplies defaults, limits, groups, CSS variables, and editor controls.
The server mirrors the supported fields in `packages/server/src/utils/site-settings.ts`; API
and unit tests cover normalization and round trips.

## Common and advanced details

The common editor keeps the existing 24 controls. The Advanced details toggle exposes individual
spacing, typography, glass borders and shadows, hover behavior, NoTab wrapping, background
positioning, language-specific fonts, and scene tuning. Search matches translated labels and
finds advanced controls even when the toggle is off. Scene controls appear only for applicable
scene kinds; background image controls are disabled with an explanation when no image is set.

Seven groups organize the controls: layout, folders, search, glass, background, scene, and
typography. Groups can be collapsed or reset independently. Reset all asks before replacing
supported values. Theme selection changes appearance values as well as the theme and accent.
The four current public themes remain; removed themes and old module sidebars are not restored.

## Existing configurations

All supported fields are parsed and clamped. Safe scalar values for other legacy fields are
preserved through saves as inert metadata; they do not become CSS variables. Objects, null,
nonfinite numbers, prototype-related keys, and strings longer than 2048 characters are discarded.

For configurations created with the short catalogue, missing spacing fields inherit the saved
density. Missing secondary text colours inherit the bookmark or page-title colour; the older
`categoryTextColor` also remains a fallback for NoTab and folder text. Search blur inherits panel
blur only if it has not been specified independently. Choosing a density seeds its individual
spacing controls, which remain adjustable afterwards. These migrations happen during parsing
and do not require a bulk database update.

Dark mode supplies default panel/search colours and opacity only where explicit values are
absent. Custom colours, opacity, typography, and mobile bookmark sizes take precedence over
mode and responsive defaults. The background mode overlays and dark glass scrim are separately
adjustable. Small screens reduce page padding proportionally; narrow phones use two bookmark
columns and preserve the owner's chosen text, icon, gap, and row sizes.

Values already deleted from stored configurations by older saves cannot be reconstructed from
current data alone. Existing retained values resume working; absent values use migration defaults.

## Live preview

Edits update the actual homepage immediately; there is no separate preview frame. On desktop,
the page leaves room for the settings drawer on its right. On phones and narrow tablets, the
settings drawer occupies the lower 56% of the viewport, leaving the actual homepage visible
above it. The page remains scrollable and interactive while settings are open. Adjusting a
control brings the relevant title, search, or folder area into view. Extra bottom space lets
short pages scroll their content above the mobile sheet.

The transparent, nonblocking backdrop preserves the page's appearance. Close and Escape still
use the draft-discard flow. All routes retain their ordinary framing restrictions.

## Save behavior

`draftSignature()` includes appearance, theme, page colours, and all personal presets. Saving
captures a serialized snapshot before sending the request. The response acknowledges that
submission; edits made while it is in flight remain dirty and visible. A drawer reopened during
a request follows the completed save if untouched, or keeps new edits compared against the
successful submission. Closing or following a link in the same tab asks before discarding
changes; refresh and browser navigation use the browser’s unsaved-change prompt.

Header actions remain reachable above the scrolling controls. Save is
disabled for an unchanged draft or an in-flight request. Confirmation appears only when the
visible draft has actually been saved. Personal presets use the same request lifecycle and
support up to three named entries.

## Backgrounds and scenes

Background image controls affect the user's configured image, not theme assets. Brightness and
blur apply to the image layer; the background scrim is composited into that layer. Dynamic scene
parameters feed `toSceneTuning` and the existing scene renderer, including speed, particle size,
wind, depth, blur, applicable collision/splash behavior, reduced motion, and low performance mode.

## Translations and checks

Labels, options and editor messages have Chinese and English entries. The English catalogue is
typed against the Chinese one. Unit tests cover field normalization, compatibility, themes and
save races; browser regressions measure actual computed styles on desktop/mobile, visible homepage
updates, advanced controls, saved colours after reload, and small/short screen usability.
