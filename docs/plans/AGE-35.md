---
status: draft
scope: packages/extract-video (new), tests
owner: gintary
---

# Plan — AGE-35 Video/GIF and storyboard evidence extractor

Spec: `docs/specs/AGE-35.md`. Verify: `npm test`; install with `npm install --include=dev` (the shell may export `NODE_ENV=production`).

1. Baseline: `npm install --include=dev && npm test` in the card worktree.
2. Check `ffmpeg`/`ffprobe`.
3. Failing tests on a synthetic ffmpeg video in a temp dir; output validates under AGE-34.
4. Implement fingerprinting, sampling, frame difference, centroid tracking from raw frames (no new npm dependency).
5. Uncertainty report and missing-ffmpeg path.
6. Mutation: claim an easing curve; a test must reject it.
7. Verify: `npm test`; quote the exact result on the card. Small scoped commits. Push the branch; open a PR with base `integration/m5-base` (retarget to `main` after upstream PRs merge). Never merge.
