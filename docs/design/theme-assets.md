# Theme scene assets

The public navigation themes use local copies of the following CC0 images. Openverse identifiers are retained so each source can be audited independently of the upstream CDN.

| Local file | Theme | Openverse ID | Source | License |
| --- | --- | --- | --- | --- |
| `summer-bubbles.jpg` | Summer Breeze | `6f538031-6ede-4fb5-a3c1-48c5a94b3268` | [Water bubbles floating underwater](https://openverse.org/image/6f538031-6ede-4fb5-a3c1-48c5a94b3268) | CC0 1.0 |
| `winter-snowflake.png` | Winter Glow | `89c80529-a3b9-47b1-b939-158da30f2987` | [Snowflake transparent PNG](https://openverse.org/image/89c80529-a3b9-47b1-b939-158da30f2987) | CC0 1.0 |
| `verdant-leaves.jpg` | Verdant Leaves | `b49590b1-d6f8-4d6b-ab30-fe2bfeac7429` | [Sunlight on Green Ivy Leaves](https://openverse.org/image/b49590b1-d6f8-4d6b-ab30-fe2bfeac7429) | CC0 1.0 |
| `starlit-sky.jpg` | Starlit Night | `0c2c3228-2e9f-47e8-845a-b2b2b67fb825` | [Milky Way Galaxy in Star Filled Night Sky](https://openverse.org/image/0c2c3228-2e9f-47e8-845a-b2b2b67fb825) | CC0 1.0 |
| `clear-sunbeams.jpg` | Clear Day | `5f1dc6bb-7a41-4657-a512-dfafddfee862` | [Crepuscular rays over pine forest](https://openverse.org/image/5f1dc6bb-7a41-4657-a512-dfafddfee862) | CC0 1.0 |
| `rain-window.jpg` | Rainy World | `75352819-64f2-4b74-944b-944493fac893` | [Rain droplets window background](https://openverse.org/image/75352819-64f2-4b74-944b-944493fac893) | CC0 1.0 |

The files are served from `/theme-scenes/` and are intentionally kept near 1024 px. Raster files are low-opacity environment textures only. Bubbles, snowflakes, leaves, stars, sun dust, rain lines, ripples, god rays, and glass droplets are generated as transparent CSS shapes, so falling elements never carry a rectangular image background.

## Scene motion

`ThemeScene.vue` builds the field from a deterministic hash noise, so the layout is identical on the server, in the browser, and in tests. Each particle carries a `depth` in 0–1 that drives its size, brightness, and travel speed, so near and far layers separate instead of moving as one sheet. Motion is split across three clocks that never line up:

- the span travels (fall / rise / twinkle) on `--scene-duration`;
- its `::before` sways, wobbles, or flutters on an unrelated `--scene-sway-duration`;
- `.scene-wind` gusts the whole field together for snow, leaves, and rain, and drifts the sky for stars.

Behind the field, `.scene-atmosphere` and `.scene-aura` run the same light at two different speeds, and `.scene-vignette` tints the edges with the theme's own overlay colour. Pointer parallax moves the texture and the particle field in opposite directions for depth.

Contrast is deliberate: on the light themes white-on-white particles disappear, so bubbles carry an accent-tinted rim and shadow, rain draws a dark body with a bright head, and god rays use a warm amber wash rather than a `screen` blend (which collapses to white on a light page).

Scene layers ignore pointer input, thin out on mobile, pause entirely in hidden tabs, and stop animating when `prefers-reduced-motion` is enabled.
