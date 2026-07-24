/**
 * Expo's web bundler handles CSS side-effect imports (Leaflet ships its own stylesheet and
 * will not render tiles or controls correctly without it), but TypeScript has no built-in
 * notion of importing a stylesheet for effect. This declares that shape so the import
 * type-checks.
 */
declare module '*.css';
