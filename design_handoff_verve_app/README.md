# Handoff: Verve — B2B Marketing/Social Mobile App

## Overview
Verve is a B2B marketing platform pitched as a mix of LinkedIn and Instagram: businesses post short-form video/creative content to reach buyers. Unlike LinkedIn, its algorithm actively rewards creative, engaging posts (surfaced via visible "creativity score" / "trending" badges and a dedicated For You discovery feed) instead of suppressing business content. Tone is bold, energetic, culture-forward — closer to a creator app than a stiff B2B tool.

## About the Design Files
The files in this bundle (`Verve.dc.html` + its two support scripts) are **design references built in HTML/React-in-browser**, not production code. They render an interactive iPhone-frame prototype with 8 screens wired together with simple client-side state — built to communicate layout, flow, and visual language, not to be shipped as-is.

**Task:** recreate this design in the target codebase's actual stack (React Native, SwiftUI, Kotlin/Compose, or whatever the team standardizes on) using that stack's own component and navigation patterns. If no mobile stack exists yet, React Native is a reasonable default given the design is a single content feed + standard nav patterns.

Open `Verve.dc.html` directly in a browser to see/interact with the live prototype (pill switcher at the top jumps between screens directly; the phone itself is also click-through — bottom nav, feed tabs, and Profile → Analytics all navigate).

## Fidelity
**High-fidelity.** Colors, type, spacing, and copy below are final for this design pass. Treat hex/oklch values, font choices, and copy as the source of truth; imagery is placeholder only (see Assets).

## Design Tokens

**Colors**
- White (primary surface): `#ffffff`
- Ink (primary text): `oklch(0.17 0.01 95)` (near-black, warm-neutral)
- Ink soft (secondary text): `oklch(0.5 0.01 95)` / `oklch(0.55 0.01 95)`
- Paper (subtle bg): `oklch(0.98 0.004 90)` / `oklch(0.96 0.005 95)` (search bars, chips, cards)
- Line/divider: `oklch(0.93 0.006 95)`
- **Gold accent (brand):** `oklch(0.74 0.15 85)` — primary CTA, active states, badges, nav highlight
- Gold deep (icon accents): `oklch(0.6 0.14 78)`
- Gold pale (banner bg): `oklch(0.94 0.05 90)`
- Dark surface (video/full-bleed screens): `oklch(0.13 0.01 90)`
- Positive/growth green: `oklch(0.55 0.15 145)`

**Typography**
- Display/headings: **Space Grotesk**, weight 600–700
- Body/UI: **Manrope**, weight 400–800
- Minimum UI text size: 11px (labels); body copy 13–15px; headline sizes 20–40px

**Radius/shape**
- Cards/sheets: 14–20px
- Buttons/pills: full pill (100px) for CTAs and tags
- Avatars: circle

## Screens

### 1. Onboarding
- White background, no nav chrome.
- Two overlapping angled cards top-right (decorative, one gold) hinting at feed content and a "96 creativity score" badge.
- Headline "B2B marketing that isn't boring." (Space Grotesk 700, 40px) + one-line subhead.
- Two stacked CTAs pinned to bottom: gold filled pill "Create your business page" (primary), text-only "I already have an account" (secondary).

### 2. Home Feed
- Full-bleed vertical video (9:16), dark theme, white status bar icons.
- Top-center tabs: "Following" / "For You", active tab bold white with gold underline, inactive tab 60%-opacity white, no underline.
- Right action rail (like/comment/share icons + business avatar), each icon with a count label below.
- Bottom-left overlay: gold "TRENDING · ## SCORE" pill (only shown if post is trending) above business handle, tag, and caption, all white text over a bottom gradient scrim.
- Bottom tab bar: Home / Discover / Compose (gold square "+") / Messages / Profile, translucent dark blurred bar.
- Switching Following/For You swaps the active post's content (demo data only; real app would swap the whole feed).

### 3. Discover
- White bg, "Discover" large title, search bar (paper-gray pill, no live search wired), horizontal filter chips ("Trending" active gold, others neutral).
- 2-column grid of 9:16 video thumbnails; trending items get a small gold score badge top-left; business name + like count overlaid bottom-left on gradient scrim.
- Tapping a tile opens Post Detail for that item.
- Standard bottom tab bar (Discover active/gold).

### 4. Compose
- Modal-style header: "Cancel" (left, text), "New Post" (center title), gold "Post" pill (right).
- Large video/image drop zone (placeholder).
- Caption field (paper-gray box, placeholder copy shown as static demo text — should be a real editable text input in production).
- Gold-tinted "Boost your creativity score" tip banner explaining original formats/bold hooks rank higher.
- Tag chip row (one tag pre-selected gold, others neutral pills) — should be single or multi-select in production, TBD by team.

### 5. Post Detail
- Top ~56% is the video/image (dark), with back chevron (top-left, circular scrim button) and business handle + caption overlaid at the bottom of the video on a gradient scrim.
- Bottom sheet (white, rounded top corners, overlapping the video slightly) contains: stat row (Likes / Comments / Shares / Score), scrollable comment list (avatar + name + text), and a comment input bar with gold send button pinned at the bottom.
- No bottom tab bar on this screen (back chevron is the only nav).

### 6. Profile
- Cover banner image (placeholder) with a translucent "more" (···) button top-right.
- Circular logo avatar overlapping the banner (white 4px border), gold "Follow" pill button beside it.
- Business name + gold verified checkmark, @handle + category line, bio paragraph.
- Stats row: posts / followers / following (bold numbers, gray labels).
- Full-width "View Analytics" button (paper-gray, gold bar-chart icon) — routes to Analytics.
- Tabs: "Posts" (active, gold underline) / "About".
- 3-column grid of post thumbnails (9:16 placeholders).
- Standard bottom tab bar (Profile active/gold).

### 7. Analytics
- Reached only via Profile → "View Analytics"; back chevron returns to Profile. No bottom tab bar.
- Two stat cards side by side: Views (30d) and Engagement, each with a bold number and a green "+X% vs last month" delta.
- Full-width dark/gold "Creativity Score" card: big number (94/100), supporting line ("Top 4% of businesses on Verve"), and a circular progress ring (SVG stroke-dasharray) on the right.
- "Weekly views" bar chart card: 6 simple CSS bar columns with week labels; current/most-recent week highlighted gold, others neutral gray.
- "Top post" summary row with a small gold icon, post name, and score/likes/shares line.

### 8. Messages
- "Messages" large title + compose/new-message icon (top-right, not wired).
- Scrollable list of DM threads: circular avatar placeholder, business/contact name (bold), last-message preview (truncates with ellipsis), timestamp, and a small gold unread dot when `unread: true`.
- Standard bottom tab bar (Messages active/gold).

## Interactions & Behavior (as prototyped)
- Global screen state (`onboarding | home | discover | compose | postDetail | profile | analytics | messages`) driven by a simple `go(screen)` state setter — no real routing/history stack.
- Home feed has a `feedTab` state (`forYou | following`) that swaps which single demo post is "active" — in production this should swap the entire ranked feed, not just one post's caption.
- Tapping a Discover tile sets an `activePostId` and navigates to Post Detail.
- Bottom nav icons on Home/Discover/Messages/Profile navigate directly between those 4 tabs + Compose; Compose and Post Detail are treated as modal/detail screens without their own tab bar.
- No animated transitions between screens in the prototype (instant swap) — recommend production add standard platform transitions (push/pop, modal sheet present/dismiss).
- No forms are functionally wired (compose caption, comment input, search, message compose) — these are static/placeholder in the HTML and need real inputs + state in the app.

## State Management (suggested real-world shape)
- `currentUser` / `currentBusiness` (auth + owned page)
- `feed` collections: `forYouFeed[]`, `followingFeed[]` (each a ranked list of posts with media, caption, tags, stats, trending flag, creativity score)
- `post` detail: comments[], like/comment/share counts, current user's like state
- `profile`: business info, stats, post grid, follow state
- `analytics`: time-series views/engagement, creativity score, top post
- `messages`: threads[], per-thread message list, unread state
- `compose`: draft media, caption, tags, upload/publish status

## Assets
All imagery in the prototype is **placeholder** (drag-and-drop image slots / plain color blocks) — no real photography, video, or logos are included. Icons are simple hand-built inline SVGs (heart, comment, share, search, chevron, etc.) meant only as stand-ins; use the target platform's icon system (SF Symbols, Material Icons, or a custom icon set) in production.

## Files
- `Verve.dc.html` — the full interactive prototype (open directly in a browser).
- `ios-frame.jsx` — iPhone device bezel/status-bar used only for prototype presentation (not part of the design itself).
- `image-slot.js` — drag-and-drop placeholder component used only for prototype presentation.
