# Theme scenes

The public navigation themes no longer ship background imagery. Each theme is a colour
palette plus a particle scene; the page background is the theme's own colour with one soft
vertical wash over it, so nothing competes with the content.

The CC0 photographs that used to sit behind the scenes (`public/theme-scenes/*`) were removed
along with the `optimize:scenes` script that generated their WebP variants. Nothing references
them any more; recover them from git history if a background is ever wanted again.

## Scene motion

`src/utils/sceneParticles.ts` holds the whole simulation and has no DOM dependency, which is
what makes the physics unit-testable (`test/scene-particles.test.ts`). `ThemeScene.vue` owns
rendering: it sizes a canvas, samples collision surfaces from the page, and steps the field on
`requestAnimationFrame`.

**Weather evolves.** `intensityEnvelope` combines two incommensurable periods, so rainfall
builds to a downpour and eases to a drizzle without repeating on an obvious cycle.
`sizeEnvelope` drifts particle size on its own period, so a squall brings visibly fatter drops.

**Particles collide with the interface.** Collision surfaces come from `data-scene-collider-id`
— the folder cards' glass content panels and the tab strip. Deliberately *not* the folder card
root: its top edge is the floating title, so colliding there would pile weather above the folder
label. `data-folder-card-id` stays on the root purely for drag-and-drop. Surfaces are measured
about four times a second and keyed by id, so a drift survives scrolling and re-layout.

Per scene:

- **rain** is permeable, and its water has a full life cycle. Every border it meets throws a
  short spray, then randomly either holds the drop or lets it through, so a lower row is never
  shadowed by the one above it. `retainChance` rises with each layer crossed (never to 1), and
  `energyAfterPass` costs the drop size and speed, so rain thins and fades with depth.

  Held water becomes a **bead** on the top border with its own size, slide speed, lifetime and
  shape jitter. Beads drift along the border, slow under drag, and coalesce when they touch —
  `mergedSize` adds volume rather than radius, so two equal beads make one of ∛2× the radius.
  A bead either dries out or runs off to the **eave**, where `feedEave` merges it into a drop
  hanging from the bottom edge. That drop grows on a trickle, wobbles and stretches as it
  ripens, and at a per-drop `detachAt` threshold lets go — starting near rest and accelerating
  toward `RAIN_TERMINAL`, already marked spent so it re-enters the pass/bead/splash system on
  the panels below. Every threshold, lifetime and wobble phase is randomised per drop, so
  drips are never evenly timed or synchronised across cards.

  Water is drawn as translucent blue-grey with a single small highlight — never opaque white
  spheres. Falling drops are elongated teardrops along their velocity; impacts are short spray
  strokes rather than beads.
- **snow** accumulates as a depth field per surface. `relaxPile` compacts it and slumps steep
  columns into their neighbours, so it settles into rounded banks rather than spikes.
- **leaves** come to rest as individual leaves, lying flatter than they fell, capped per surface
  so the oldest is blown off as new ones land.
- **bubbles**, **stars**, and **sunbeams** pass through: nothing lands.

Shared behaviour: a fast landing bounces before it settles, a particle touching down within
`EDGE_SLIP` of a lip slides off instead of balancing on the corner, and a particle that clips
the flank of a card is deflected clear of it.

Scene layers ignore pointer input, thin out on mobile, pause entirely in hidden tabs, and skip
the simulation altogether when `prefers-reduced-motion` is set.
