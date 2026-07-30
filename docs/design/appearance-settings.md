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

`appearanceDefaults` has `applyAppearanceMirrors` applied to it, so the legacy mirrored keys
(`tabOpacity`, `modalRadius`, and friends) can never disagree with the settings that replaced them,
not even before a site has been saved once.

## Groups

Seven groups, each a section in the editor: `layout`, `folders`, `search`, `glass`, `background`,
`scene`, `typography`. A field marked `advanced: true` sits inside that section's collapsible block
so the common set is not buried.

Presets seed a group and nothing more. `DENSITY_PRESETS` writes the layout values for Compact,
Balanced or Spacious; `GLASS_PRESETS` does the same for Performance, Balanced and Transparent. Every
value stays individually adjustable afterwards.

## Scene applicability

A field can carry a `scenes` list, and `fieldAppliesToScene` hides it when the selected theme's
scene is not in it. This is not cosmetic: after the snow rework, **rain is the only scene that
touches the interface**, so collision and splash are rain-only. Leaves and snow are purely airborne,
and stars hold position, so wind means nothing to them either.

## The editor

`AppearanceEditor.vue` walks the table. Per group it renders the common controls, then an advanced
block, a per-group reset, and a count of how many settings in it differ from the default. A modified
control carries `data-changed` and a quiet "Changed" chip. Search matches against the *translated*
label and expands the advanced blocks while it is active, so a control can be found without knowing
which group owns it. `Reset all` confirms first.

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

Every label, group name, option and piece of editor chrome has a zh and an en entry.
`scripts/gen-appearance-catalog.py` writes both blocks from one table: `en` is typed against
`typeof zh`, so the two have to stay identically shaped, and generating them together is what keeps
them that way.
