# Scorpio reviewer example

The deterministic evaluator produces synchronized storyboard, transition and animation views. Review evidence covers every required scenario segment and binds approval to the displayed prototype revision and SHA-256 digest.

## Interactive reviewer

Set host-owned credentials, then run the local server:

```sh
MIP_APPROVAL_SECRET='replace-with-random-secret' \
MIP_REVIEW_TOKEN='review-session-token' \
MIP_REVIEWER_ID='designer-id' \
node examples/scorpio/serve.mjs
```

Visit http://127.0.0.1:4173/. Enter `MIP_REVIEW_TOKEN`, inspect all segments, then approve. Server persists immutable `prototype-spec` and `prototype-review` artifacts plus signed lock sidecars under `.mip/reviews` by default. Override with `MIP_REVIEW_DIR`.

`MIP_REVIEW_TOKEN` identifies an authenticated local review session in this reference host. Production adapters must replace token equality with their trusted host authentication callback. `MIP_APPROVAL_SECRET` signs persisted human approval attestations and must remain host-only.

Run `npm test` for unit, negative and HTTP integration coverage.
