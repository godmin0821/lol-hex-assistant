# Design QA

Reference: Product Design option 1, tactical command-board concept.

Implementation: responsive web planner in `public/` and GitHub Pages mirror in `docs/`.

## Comparison evidence

- Reference image: `/Users/bytedance/.codex/generated_images/019e7686-18a6-78d2-b1b0-859e57f830bb/exec-d6684eb7-938f-4baf-9d24-8819bb323002.png`
- Implementation screenshot: `/private/tmp/lol-tactical-mobile-final.png`
- Combined same-viewport comparison: `/private/tmp/lol-design-qa-comparison.png`
- Viewport: 390 x 844
- State: Brand / first augment selected as `术士果汁盒`
- Focused comparison: not required. The combined image shows the hero, four-step rail, selected augment, route card, item sequence, and sticky next-step CTA at native mobile scale.

## Findings and fixes

1. The first implementation made each route too tall and delayed the next decision. Fixed by limiting mobile cards to the three core items and two next-augment choices.
2. The planner explanation repeated information already visible in the step rail. Fixed by hiding that secondary sentence on mobile.
3. The hero area consumed too much vertical space. Fixed by reducing the mobile hero to 184px while preserving champion recognition and stats.
4. The generated concept used a denser poster scale than a real phone UI. The implementation intentionally keeps Chinese text and touch targets at readable native sizes, so route B continues below the first viewport.
5. No horizontal overflow, clipped route titles, broken item images, or visible overlap remain at 390px.

## Interaction QA

- Hero search returned Brand from the alias `火男`.
- Entering `术士果汁盒` updated both equipment routes and the next-augment recommendations.
- Selecting `超凡邪恶` advanced the planner to the third augment.
- Removing the second augment returned the planner to the second-augment state.
- All nine tested item images loaded at 64px natural width.
- Mobile document width stayed at 390px with no horizontal overflow.
- Desktop at 1440 x 1024 rendered two 529px route columns with no horizontal overflow.
- Browser console produced no errors or warnings in the tested flow.

final result: passed
