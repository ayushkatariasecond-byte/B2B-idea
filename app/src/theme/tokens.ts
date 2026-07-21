/**
 * Colors are converted 1:1 from the design's oklch() source values (see design doc)
 * by rendering each swatch in a real browser color pipeline, so hex values match exactly.
 */
export const colors = {
  white: '#ffffff',
  ink: '#110f0b', // oklch(0.17 0.01 95) — primary text
  inkSoft: '#65635d', // oklch(0.5 0.01 95) — secondary text
  inkSoft2: '#73726b', // oklch(0.55 0.01 95)
  inkFaint: '#a5a29a', // IG-redesign faint/tertiary text — stat labels, "View all N comments", timestamps
  inkFaint2: '#918f88', // oklch(0.65 0.01 95) — inactive nav icons
  inkMuted: '#8a8780', // IG-redesign — inactive nav icon stroke, input placeholder text
  bodyText: '#3c3b35', // oklch(0.35 0.01 95) — bio/caption body copy
  captionText: '#3a382f', // IG-redesign — compose caption box / profile bio text
  chipText: '#494842', // oklch(0.4 0.01 95) — unselected chip label
  backIcon: '#2f2e28', // oklch(0.3 0.01 95)
  endFeedText: '#c9c6bf', // IG-redesign — "YOU'RE ALL CAUGHT UP" end-of-feed marker

  paper: '#f9f8f5', // oklch(0.98 0.004 90) — search bars, lightest surface
  paper2: '#f3f2ee', // oklch(0.96 0.005 95) — chips, cards
  paper3: '#f6f5f1', // oklch(0.97 0.005 95) — compose caption box
  surfaceMuted: '#f6f5f2', // IG-redesign — onboarding decorative card, compose caption box, profile analytics button bg
  surfaceMuted2: '#f2f1ed', // IG-redesign — search bar, inactive chips, comment input pill, grid-tile fallback
  decorativeCard: '#f8f5ee', // oklch(0.97 0.01 90) — onboarding decorative card

  line: '#e9e8e3', // oklch(0.93 0.006 95)
  line2: '#e6e5e0', // oklch(0.92 0.006 95)
  line3: '#ecebe7', // oklch(0.94 0.006 95)
  hairline: 'rgba(17,15,11,0.06)', // IG-redesign — standard card/header hairline divider
  hairlineStrong: 'rgba(17,15,11,0.08)', // IG-redesign — bordered stat/chart cards
  navHairline: 'rgba(17,15,11,0.07)', // IG-redesign — bottom-nav top border
  commentAvatarFallback: '#d8d5cd', // IG-redesign — comment/thread avatar placeholder fill
  threadReadRing: '#e5e2da', // IG-redesign — thread avatar ring when read (flat, vs gold when unread)
  chartBarInactive: '#ece9e2', // IG-redesign — analytics weekly-views bar (non-current weeks)

  gold: '#d6a20a', // oklch(0.74 0.15 85) — brand accent
  goldDeep: '#ad7300', // oklch(0.6 0.14 78) — icon accents
  goldPale: '#f8eac6', // oklch(0.94 0.05 90) — banner bg
  goldPaleAlt: '#f5e7c3', // oklch(0.93 0.05 90) — top-post icon bg
  goldSubtext: '#c7bda8', // oklch(0.8 0.03 85)
  goldSubtext2: '#d7cdb8', // oklch(0.85 0.03 85)
  tipTitle: '#4d3600', // oklch(0.35 0.08 85)
  tipSubtitle: '#65532c', // oklch(0.45 0.06 85)
  bannerGoldBg: '#fdf7e8', // IG-redesign — compose "boost your score" tip banner bg
  bannerGoldBorder: 'rgba(214,162,10,0.25)', // IG-redesign — tip banner border
  bannerGoldTitle: '#8a6100', // IG-redesign — tip banner title text
  bannerGoldBody: '#a5824a', // IG-redesign — tip banner body text

  avatarPlaceholder: '#e7ddc8', // oklch(0.9 0.03 85)
  avatarPlaceholder2: '#eee4cf', // oklch(0.92 0.03 85)
  barNeutral: '#dfdeda', // oklch(0.9 0.006 95)

  reopenPlum: '#3a0f1f', // reopen animation — beat 3 background
  reopenPaper: '#f2efe7', // reopen animation — beat 4 handoff background / nav bar

  dark: '#090704', // oklch(0.13 0.01 90) — video/full-bleed surfaces
  darkGold: '#1a150b', // oklch(0.2 0.02 85) — creativity score card
  darkGoldDeep: '#030201', // oklch(0.09 0.01 90) — splash radial gradient outer edge
  splashGlow1: '#ddb13a', // oklch(0.78 0.14 88) — splash glow orb / verve. dot
  splashGlow2: '#cc9300', // oklch(0.7 0.15 82) — splash glow orb 2
  splashSubtext: '#b3aea0', // oklch(0.75 0.02 90) — splash subhead text
  gradientGoldStart: '#e3b842', // oklch(0.8 0.14 88) — CTA gradient start
  gradientGoldEnd: '#c58300', // oklch(0.66 0.16 79) — CTA gradient end

  green: '#16a34a', // IG-redesign — positive delta / growth (updated from prior value)
} as const;

export const fonts = {
  display: {
    medium: 'SpaceGrotesk_500Medium',
    semiBold: 'SpaceGrotesk_600SemiBold',
    bold: 'SpaceGrotesk_700Bold',
  },
  body: {
    regular: 'Manrope_400Regular',
    medium: 'Manrope_500Medium',
    semiBold: 'Manrope_600SemiBold',
    bold: 'Manrope_700Bold',
    extraBold: 'Manrope_800ExtraBold',
  },
};

export const radius = {
  xs: 11, // IG-redesign — search bar, small buttons
  sm: 10,
  smd: 13, // IG-redesign — compose caption box, tip banner
  md: 14,
  lg: 16,
  xl: 20,
  heroCard: 18, // IG-redesign — analytics hero card
  sheet: 22, // IG-redesign — post detail bottom sheet top corners
  pill: 100,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
};
