---
source_id: 0006
title: XR in-VR interaction & voice boundary decision
origin: "dev session 2026-06-18 — boundary discussion with user (jyc), prompted by the saas app's VR case"
fetched: 2026-06-18
type: user-note
supersedes: null
---

# In-VR interaction & the voice boundary (2026-06-18)

Question raised by the saas integration (raw/0005): in immersive WebXR the 2D DOM
chat box is gone, so the user can only talk to the agent by **voice**. What does
van-der-view own here?

## Decision (boundary)
- **The consuming app owns:** voice capture, STT, wake-word, the agent loop, and the
  in-XR interaction UX. Same logic as "no chat UI / the library doesn't own the LLM
  call" — voice is just another input modality for the chat.
- **van-der-view owns / must guarantee:**
  1. **Mid-XR dispatch works** — a `Command` applies to the live scene while
     `canvas3d.xr.isPresenting` (already our responsibility; covered by the XR smoke
     in [[testing-strategy]]).
  2. **`get-scene-context`** keeps the agent oriented without any DOM (already v1).
  3. **Expose XR state/events first-class** so the app can flip UI modality on
     enter/exit instead of reaching through the `viewer.plugin` escape hatch:
     `viewer.xr.isSupported`, `viewer.xr.isPresenting`, and a `viewer.on('xr-change', cb)`
     event (thin wrappers over `canvas3d.xr`'s BehaviorSubjects).

## Why it's mostly "free"
The executor is **input-modality-agnostic**: a `Command{name,input}` from voice is
identical to one from text or a button. So voice-driven VR control needs no new
feature — only that the app can produce a Command and call `dispatch`, and that
dispatch works mid-XR (it does).

## Hard constraint to surface to apps
- **You cannot voice-*enter* VR.** `xr.request()` needs a real user gesture (transient
  activation: click/touch/keydown); a speech-recognition result does NOT count. So:
  **enter = a click** ("Enter VR" affordance, per `toggle-xr`), then voice drives
  in-headset, and **exit** can be programmatic (`end()`) or a controller button
  (Mol\* default GamepadB). (Extends command-schema hard constraint #1.)

## Out of scope (v1)
- In-XR visual feedback HUD (3D text toasts confirming a command). The command's own
  visible effect (highlight/focus) is the feedback; a HUD is the app's job or a later
  enhancement.
