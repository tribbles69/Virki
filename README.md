# Virki

A single-player, real-time village builder in the spirit of Tribal Wars and Travian. You get one village, a tiny map, bandits that respawn every day and a progression curve built to last years. There are no tribes and no PvP.

- Design: [r&d/DESIGN.md](r&d/DESIGN.md)
- Roadmap: [r&d/ROADMAP.md](r&d/ROADMAP.md)

Installable offline PWA. Your save stays on your device.

## Running it locally

```sh
npm install
npm run dev      # live dev server
npm run build    # production build into dist/
npm run preview  # serve the production build (service worker active)
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.
