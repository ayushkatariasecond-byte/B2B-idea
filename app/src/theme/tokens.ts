/**
 * Colors are converted 1:1 from the design's oklch() source values (see design doc)
 * by rendering each swatch in a real browser color pipeline, so hex values match exactly.
 */
export const colors = {
  white: '#ffffff',
  ink: '#110f0b', // oklch(0.17 0.01 95) — primary text
  inkSoft: '#65635d', // oklch(0.5 0.01 95) — secondary text
  inkSoft2: '#73726b', // oklch(0.55 0.01 95)
  inkFaint: '#82807a', // oklch(0.6 0.01 95) — timestamps
  inkFaint2: '#918f88', // oklch(0.65 0.01 95) — inactive nav icons
  bodyText: '#3c3b35', // oklch(0.35 0.01 95) — bio/caption body copy
  chipText: '#494842', // oklch(0.4 0.01 95) — unselected chip label
  backIcon: '#2f2e28', // oklch(0.3 0.01 95)

  paper: '#f9f8f5', // oklch(0.98 0.004 90) — search bars, lightest surface
  paper2: '#f3f2ee', // oklch(0.96 0.005 95) — chips, cards
  paper3: '#f6f5f1', // oklch(0.97 0.005 95) — compose caption box
  decorativeCard: '#f8f5ee', // oklch(0.97 0.01 90) — onboarding decorative card

  line: '#e9e8e3', // oklch(0.93 0.006 95)
  line2: '#e6e5e0', // oklch(0.92 0.006 95)
  line3: '#ecebe7', // oklch(0.94 0.006 95)

  gold: '#d6a20a', // oklch(0.74 0.15 85) — brand accent
  goldDeep: '#ad7300', // oklch(0.6 0.14 78) — icon accents
  goldPale: '#f8eac6', // oklch(0.94 0.05 90) — banner bg
  goldPaleAlt: '#f5e7c3', // oklch(0.93 0.05 90) — top-post icon bg
  goldSubtext: '#c7bda8', // oklch(0.8 0.03 85)
  goldSubtext2: '#d7cdb8', // oklch(0.85 0.03 85)
  tipTitle: '#4d3600', // oklch(0.35 0.08 85)
  tipSubtitle: '#65532c', // oklch(0.45 0.06 85)

  avatarPlaceholder: '#e7ddc8', // oklch(0.9 0.03 85)
  avatarPlaceholder2: '#eee4cf', // oklch(0.92 0.03 85)
  barNeutral: '#dfdeda', // oklch(0.9 0.006 95)

  dark: '#090704', // oklch(0.13 0.01 90) — video/full-bleed surfaces
  darkGold: '#1a150b', // oklch(0.2 0.02 85) — creativity score card

  green: '#278733', // oklch(0.55 0.15 145) — positive delta
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
  sm: 10,
  md: 14,
  lg: 16,
  xl: 20,
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
