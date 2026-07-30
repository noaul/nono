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
  columns into their neighbours, so it settles into rounded banks rather than spikes. Compaction
  is proportional to depth: a deep drift settles under its own weight while a thin dusting barely
  moves. A flat rate scrubbed thin cover off wide surfaces faster than snow could lay it down.
- **leaves** never land. They are pure flight: nothing settles on a folder, a Notab tab, the
  search bar or a heading, and none of those act as collision surfaces at all — `measureLedges`
  does not even sample the page for this scene, so a leaf simply drifts until it leaves the
  viewport and is recycled.

  Flight is drag toward a wandering `windField` — two slow breezes that reverse, plus occasional
  `gustStrength` peaks that briefly amplify tumble and flip. Each leaf keeps its own sway phase
  and rate, spin direction and flip rate, so no two share a trajectory, and the sway term is
  applied to vertical speed as well, letting a leaf rise while it drifts. Depth is biased toward
  the distance (`random() ** 1.7`), which keeps the near layer sparse; distant leaves are smaller,
  slower and fainter, and only the closest get a touch of blur.

  `sceneLeaf.ts` draws them. The blade is sampled from a width envelope that reaches zero at both
  ends, so the outline always closes to a point at the tip; the two halves are scaled differently,
  and the midrib leans further the closer it gets to the tip. Veins take their end points from the
  same envelope, which is why they can never poke outside the blade. A leaf turning edge-on
  compresses toward a line and dims, which is what reads as rotation in three dimensions rather
  than a sprite spinning in the plane of the screen. Dry yellow needs both the right variant and
  the right jitter, so it stays around one leaf in ten instead of a quarter of the canopy.
- **bubbles**, **stars**, and **sunbeams** pass through: nothing lands.

Shared behaviour for scenes that do collide: a fast landing bounces before it settles, a particle
touching down within `EDGE_SLIP` of a lip slides off instead of balancing on the corner, and a
particle that clips the flank of a card is deflected clear of it.

Scene layers ignore pointer input, thin out on mobile, pause entirely in hidden tabs, and skip
the simulation altogether when `prefers-reduced-motion` is set.
