# Mortgage 3D — Twin Block

A 3D mortgage payoff visualizer with **two houses side-by-side**. Watch your strategy house build faster than the baseline as you pay off your loan.

## What it does

- **Two houses** on the same block — baseline (amber) vs. strategy (cyan)
- **Construction milestones**: Slab → Frame → Roof → Lock-up → Windows → Fit-out → Complete
- **6 strategy tiles**: Extra repayments, Round up, Fortnightly, Offset, Refinance, Negotiate
- **Gap visualization**: A glowing beam shows exactly how far ahead your strategy is
- **Hover any house part** to see its name and mortgage milestone
- **Year timeline**: Drag to any year, or hit Play to watch the build animation

## Run locally

### VS Code Live Server (recommended)
1. Open folder in VS Code
2. Install **Live Server** extension
3. Right-click `index.html` → "Open with Live Server"

### npm
```bash
npx serve .
# or
npx http-server -p 8080
```

> Must use a local server — not `file://` — because Three.js loads via ES modules from CDN.

## Deploy to GitHub Pages

1. Push all files to a GitHub repo
2. Settings → Pages → Deploy from a branch → `main` / (root)
3. Live at `https://yourname.github.io/repo-name/`

## File structure

```
├── index.html      # App shell
├── style.css       # UI styling (sidebar, bottom sheet, milestones)
├── app.js          # Three.js twin houses + mortgage math + UI
└── README.md
```

## Tech stack

- Three.js (CDN) — 3D rendering
- Vanilla JavaScript — no build step
- CSS3 — glassmorphism, responsive, mobile bottom sheet
- No backend — all math client-side

## Strategies

| # | Strategy | Status | Control |
|---|----------|--------|---------|
| 1 | **Extra repayments** | ✅ Active | Slider: $0–$5,000/mo extra |
| 2 | **Round up** | 🔜 Coming soon | Info text only |
| 3 | **Fortnightly** | ✅ Active | Info text only |
| 4 | **Offset account** | 🔜 Coming soon | Info text only |
| 5 | **Refinance** | ✅ Active | Input: new rate % |
| 6 | **Negotiate** | 🔜 Coming soon | Info text only |

## Mobile

- Swipe up bottom sheet to expand controls
- Tap 📊 for metrics panel
- Single finger orbit, two-finger pinch zoom
- Horizontal strategy tile strip

## House colors (Australian suburban)

| Part | Color | Hex |
|------|-------|-----|
| Roof | Colorbond Monument | `#3d3e40` |
| Walls | Cream render | `#d4c5b0` |
| Door | Timber | `#8B4513` |
| Windows | White frames, dark glass | `#ffffff` / `#1a2a3a` |
| Foundation | Concrete slab | `#8a8a8a` |
| Verandah posts | White | `#ffffff` |

## Construction milestones

| Phase | Height | Mortgage stage |
|-------|--------|----------------|
| Slab | 0–0.5m | 0–5% paid |
| Frame | 0.5–2.5m | 5–20% paid |
| Roof | 2.5–4.5m | 20–40% paid |
| Lock-up | 4.5–5.5m | 40–55% paid |
| Windows | 5.5–6.0m | 55–70% paid |
| Fit-out | 6.0–7.0m | 70–85% paid |
| Complete | 7.0–8.5m | 85–100% paid |
