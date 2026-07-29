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

**Particles collide with the interface.** Collision surfaces come from anything carrying
`data-folder-card-id` or `data-scene-collider-id` — folder cards and the tab strip today.
Surfaces are measured about four times a second and keyed by id, so a drift survives scrolling
and re-layout instead of resetting.

Per scene:

- **rain** splashes. Impact energy scales with speed and size, and the spray fans to both sides.
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
