# Maskot — Character & Celebrations (Rive)

Split out from [BETTER_ANIMATIONS_PLAN.md](BETTER_ANIMATIONS_PLAN.md) / [BETTER_ANIMATIONS.md](BETTER_ANIMATIONS.md) Phase 4, since the mascot isn't fully designed yet. Picks back up once a `.riv` asset exists — see [guides/ANIMATION_GUIDE.md](../guides/ANIMATION_GUIDE.md) §5.4 for the canonical Rive state-machine pattern.

## Status

Blocked on the `.riv` mascot asset (design deliverable). Everything asset-independent is already done:

- [x] `useCelebrate()` wired across all celebration moments with the emoji fallback — onboarding success ([app/onboarding.tsx](../app/onboarding.tsx)), mission complete ([app/(tabs)/missions.tsx](../app/(tabs)/missions.tsx)), goal deposit + goal creation ([app/(tabs)/goals.tsx](../app/(tabs)/goals.tsx))
- [ ] Achievement unlock — no per-badge UI exists to wire this into yet (see [BETTER_ANIMATIONS.md](BETTER_ANIMATIONS.md) Profile section notes)

## Remaining checklist

Requires a bundled `.riv` mascot asset (design deliverable) — hard blocker for everything below:

- [ ] Add bundled `assets/mascot.riv` with state machine `CharacterMachine` (inputs: `celebrate`, `concerned`, `idle`, `progress`)
- [ ] `**RiveMascot.tsx**` — wrapper per guide §5.4; expose `fireCelebrate()`, `setProgress(n)`
- [ ] Integrate mascot on: dashboard header, coach header, onboarding welcome, celebration moments (swap emoji 🐷 → `RiveMascot`)
- [ ] Wire achievement-unlock celebration once per-badge UI exists somewhere to trigger it from

## Notes for whoever picks this up

- `rive-react-native` is already installed (Phase 0) — no new dependency needed, just the asset + wrapper component.
- `useCelebrate()` ([src/components/animation/useCelebrate.ts](../src/components/animation/useCelebrate.ts)) already accepts an optional `riveRef` — once `RiveMascot.tsx` exists, pass its ref in at each call site to get the character reaction for free; no changes needed to the call sites themselves beyond adding the ref.
- Keep the emoji 🐷 as the fallback until the asset ships — don't remove it speculatively.
