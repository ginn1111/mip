# Scorpio reviewer example

The deterministic evaluator produces three synchronized representations:
- Storyboard: latest caption at current timeline position
- Transitions: named active intervals with start and duration
- Animation: interpolated actor values for a scene renderer

Run `npm test` to exercise the timeline/review example. The human-facing web renderer and evidence-bound approvals are tracked by AGE-26 and AGE-27; this initial adapter does not claim those are complete.
