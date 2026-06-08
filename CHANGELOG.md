# Changelog

## Phase 9

- Deferred Three.js Antigravity loading to desktop idle time and skipped it for reduced-motion/mobile users.
- Reduced mobile landing animation, blur, shadow, and fixed background work.
- Limited chat rendering to recent messages with a load-earlier control for long conversations.
- Reduced Markdown/KaTeX work during streaming with targeted message rendering and debounced math rendering.
- Split dashboard vendor chunks so the initial app bundle is much smaller.

## Phase 6

- Added short-term conversation context.
- Added recent message history in provider prompts.
- Added safeguards for context limits.
- Improved follow-up understanding.
