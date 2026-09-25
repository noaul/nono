# Appearance settings

The public homepage's whole look is driven by one table. `src/utils/appearance.ts` declares every
setting exactly once in `APPEARANCE_FIELDS`, and everything else is derived from it:

- `appearanceDefaults` — the shipped values
- `getAppearanceSettings` — parsing and clamping of whatever a site has saved
- `toAppearanceCssVars` — the custom properties the page reads
- the editor UI — controls, groups, search, and resets are all generated

Adding a control means adding one entry. There is no parallel list of keys, limits, or var names to
keep in step.

## How the table is typed

`APPEARANCE_FIELDS` is a `Record` keyed by `keyof AppearanceSettings`, not an array, so TypeScript
*forces* every setting to have a descriptor. `FieldFor<Value>` then picks the descriptor shape from
the value's type: a `number` setting must be given `min`/`max`, a `boolean` gets a toggle, a string
union gets `options`. Its conditionals are wrapped in tuples (`[Value] extends [boolean]`) to stop
them distributing — without that an enum like `'left' | 'center'` would demand
`EnumField<'left'> | EnumField<'center'>` and reject an options array holding both.

## A short list on purpose

There are 23 settings, and the server stores exactly those (`packages/server/src/utils/site-settings.ts`
mirrors the table, and an API test round-trips the web defaults to prove the two agree). Keys that
used to exist — the mirrored `tab*`/`modal*`/`admin*` values, the glass rim controls, per-element
text sizes and colours, scene physics — are ignored on read and dropped on the next save.

What they used to control is now derived rather than set:

- **Spacing follows density.** `DENSITY_SPACING` maps Compact, Balanced and Spacious straight to the
  gap, padding, row-height, NoTab-height and line-height variables. Density is a setting, not a
  preset that seeds other sliders.
- **Secondary colours follow the main ones.** The text colour also drives NoTab, folder, search and
  placeholder text; the title colour also drives the description.
- **The search bar and NoTab strip share the panel blur.**
- **Everything else is the stylesheet default**: rims, shadows, icon sizes, hover effects, font
  weight, and the scene's wind, depth, collision and splash.

## Groups

Six groups, each a section in the editor: `layout`, `folders` (panels), `search`, `background`,
`scene`, `typography`. The scene group only appears for a theme that has a scene; static themes hide
it.

## The editor

`AppearanceEditor.vue` walks the table. Per group it renders every control, a per-group reset, and a
count of how many settings in it differ from the default. Enums with up to three options (density,
NoTab alignment) render as a segmented control; longer ones as a select. A modified control carries
`data-changed` and a quiet "Changed" chip. Search matches against the *translated* label, so a
control can be found without knowing which group owns it. `Reset all` confirms first.

Every edit writes straight into the reactive draft the drawer holds, which is the same object the
page previews from — that is what makes the preview live rather than something that needs applying.

## The drawer header

Titles on the left; Admin (secondary), Save Appearance (primary) and Close on the right. The header
is `position: sticky`, because it now carries the actions and has to stay reachable however far the
panel is scrolled. There is no bottom action bar.

Save state is a comparison, not a flag: `draftSignature()` serialises everything the Save button
would send, and `savedSnapshot` holds the same for what is on the server. So Save is disabled when
nothing has changed, the header shows an unsaved marker when something has, a spinner while the
request is in flight, and a confirmation for a couple of seconds afterwards. Closing dirty — by
button, backdrop, or Escape — asks first.

At 640px and below the header stacks: title on the first row, the three controls in a compact
second row at `1fr 1fr 44px`, every one of them at least 44px tall. The desktop state indicator is
hidden there and reappears under the title, where a full line is available.

## Backgrounds

These settings only affect **the background image a user configured themselves**. The themes ship no
imagery at all — see [theme-assets.md](theme-assets.md) — and none of this restores any.

Brightness and blur are a `filter` on `.nav-page::before`. That layer overhangs the viewport by
twice the blur radius, or the blur feathers the page through around the edges. The scrim is a flat
gradient composited into `--nav-bg-image` rather than a pseudo-element, because `.nav-page` and
`.public-glass-page` are the same element and an `::after` here would replace the mode scrim that
rule already owns.

## Responsive columns

`folderColumns` is a ceiling, not a fixed count. The narrow-viewport steps clamp against it
(`repeat(min(3, var(--public-folder-columns, 4)), …)`), so a site set to two columns never widens to
three on a mid-size screen.

## Translations

Every label, group name, option and piece of editor chrome has a zh and an en entry. `en` is typed
against `typeof zh`, so a missing or extra key on either side fails the build.
