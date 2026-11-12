# West map outlines

`src/components/west-map-paths.ts` holds the 13 Region IV state paths copied from
`public/us-regions-map.svg` (Wikimedia "Blank US Map", public domain): one `<path class="xx" d="…">`
per state. To regenerate: for each of wa or ca nv id mt wy ut co az nm ak hi, copy the `d`
attribute of `<path class="<code>">` into `WEST_PATHS`.

California is drawn twice, clipped along an approximate Cal North / Cal South association
line (San Luis Obispo–Monterey county line on the coast to the Inyo–Mono line at the Nevada
border); see `CA_SPLIT` in `src/components/west-map.tsx`.
