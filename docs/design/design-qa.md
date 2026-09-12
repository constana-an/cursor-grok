# Design QA — 大宝 / 二宝 Identity Login

**Source visual truth**

- `/var/folders/zt/l22yfyps16b9m_4f4qgy1w100000gn/T/codex-clipboard-69241493-2072-49b8-a1f6-05c8fa7dc0f6.png`
- Source pixels: 1196 × 1836.
- Normalization: cropped the visible phone content from `(174, 0)` to `(1048, 1836)` and resized the 874 × 1836 crop to 393 × 826. Because the reference contains the shop rather than a login state, it is used as the visual-system source rather than an identical content target.

**Implementation evidence**

- Browser-rendered canvas: `implementation-identity-login-screen.jpg` (2800 × 2400).
- App-owned screen crop: `implementation-identity-login-screen-crop.jpg` (393 × 852).
- Side-by-side comparison: `design-comparison-identity-login.jpg` (826 × 882).
- Browser viewport cap: 2800 × 2400; app viewport measured exactly 393 × 852 CSS px.
- State: iPhone, light theme, first-entry identity selection with no identity chosen.
- Focused comparison: not required; both identity cards, their labels, helper copy and tap affordances are readable in the normalized full-view comparison.

**Findings**

- No actionable P0/P1/P2 findings remain.
- The new screen is intentionally calmer than the dense shop reference because it presents one decision. The visual system remains continuous through the blush canvas, pink and mint role colors, rounded white cards, compact system Chinese typography and soft elevation.

**Required fidelity surfaces**

- Fonts and typography: Passed. System Chinese typography uses clear display, card-title and helper-copy levels; 大宝 / 二宝 labels do not wrap or truncate.
- Spacing and layout rhythm: Passed. The 393 × 852 composition has a clear brand-to-title-to-choice progression, equal identity-card sizing and sufficient bottom safe-area clearance.
- Colors and visual tokens: Passed. 大宝 uses the established pink identity; 二宝 uses the existing mint secondary identity. Background, borders and focus styling reuse shop tokens.
- Image quality and asset fidelity: Passed. This state does not require raster imagery. All visible symbols come from the established Radix icon family; there are no emoji, placeholder images, custom SVGs or CSS-drawn icons.
- Copy and content: Passed. The screen explicitly explains that each iPhone should choose a different identity and that the current device remembers the choice.
- Accessibility: Passed. Identity choices are semantic buttons with full accessible names, large tap targets and visible keyboard focus treatment.

**Primary interactions tested**

- First entry presents exactly two choices: `我是大宝` and `我是二宝`.
- Choosing 大宝 enters the shop and changes realtime status to `二宝正在店里`.
- The 我们 page shows `大宝 & 二宝`, `当前身份：大宝` and the instruction for the other iPhone to log in as 二宝.
- Choosing 切换 returns to the identity screen.
- Choosing 二宝 enters the shop and changes realtime status to `大宝正在店里`.
- Reloading keeps the selected 二宝 identity and bypasses the login chooser.
- The 我们 page then shows `当前身份：二宝` and instructs the other iPhone to log in as 大宝.
- Runtime integrity, TypeScript/Vite build and all four Sites worker tests passed.
- Browser console errors after final reload: none.

**Comparison history**

1. Earlier iterations established the blush-pink shop system and paired pink/mint identity colors.
2. This iteration added a dedicated first-entry identity gate and a switch control inside the 我们 page.
3. The first normalized comparison found no actionable P0/P1/P2 issue, so no visual-fix loop was required.

**Follow-up polish**

- P3: after HTTPS deployment, verify that each physical iPhone independently remembers its own identity after closing and reopening the home-screen app.

final result: passed
