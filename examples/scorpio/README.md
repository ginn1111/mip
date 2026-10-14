# Scorpio reviewer example

The deterministic evaluator produces three synchronized representations:
- Storyboard: latest caption at current timeline position
- Transitions: named active intervals with start and duration
- Animation: interpolated actor values for a scene renderer

Run `npm test` to exercise the timeline/review example. The human-facing web renderer and evidence-bound approvals are tracked by AGE-26 and AGE-27; this initial adapter does not claim those are complete.

## Interactive reviewer

Run `node examples/scorpio/serve.mjs` from the repository root, then visit http://127.0.0.1:4173/. The browser app provides a Canvas 2D scene, scrub/play/pause, scenario selection, storyboard jumps, current transition display and timestamped comments. Comments are ephemeral and never constitute approvals or creative locks. This is a prototype; reviewer persistence and digest-bound approval require AGE-27.
