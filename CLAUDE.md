# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Free web app: paste a list of US zip codes and see them highlighted on a map.

## Stack constraints (load-bearing)

- **Vanilla HTML / CSS / JS.** No framework (no React, Vue, Svelte). No bundler, no transpiler, no build step — files in the repo are the files that ship.
- **Map: Leaflet + OpenStreetMap tiles.** Not Mapbox, not Google Maps, not MapLibre.
- **Boundaries: US Census ZCTA GeoJSON.** Zip codes ≠ ZCTAs exactly; mapping between them is a real concern, not a footnote.
- **Hosting: GitHub Pages.** Static files only — no server, no API routes, no secrets at runtime.

When in doubt, prefer adding one more `<script>` tag over introducing tooling.
