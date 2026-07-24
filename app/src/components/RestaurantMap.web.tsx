import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { colors } from '../theme/tokens';
import { NearbyRestaurant } from '../api/businesses';

/**
 * Web implementation of the feed's map view.
 *
 * Leaflet + OpenStreetMap rather than react-native-maps: react-native-maps' entire web
 * build is `react-native-web`'s UnimplementedView (it renders an empty box), and web is
 * this app's launch target, so it would have shipped a visibly broken toggle. Leaflet is
 * ~45KB, needs no API key or billing account, and talks to OSM's public tile server.
 *
 * The Leaflet map is imperative DOM, so it's created once against a plain container div
 * and then updated in place — never re-created per render, which would flicker and refetch
 * every tile. A native counterpart lives in RestaurantMap.native.tsx; Metro picks the right
 * one by extension.
 */

interface Props {
  restaurants: NearbyRestaurant[];
  center: { latitude: number; longitude: number } | null;
  onSelect: (restaurantId: string) => void;
}

// Nibbler's gold pin, inlined as an SVG data URI so there's no extra network request and
// no dependency on Leaflet's default marker asset paths (which break under bundlers).
const PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 28 38">
  <path d="M14 0C6.3 0 0 6.3 0 14c0 10 14 24 14 24s14-14 14-24c0-7.7-6.3-14-14-14z" fill="#c58300"/>
  <circle cx="14" cy="13.5" r="5.5" fill="#fff"/>
</svg>`;

const pinIcon = L.icon({
  iconUrl: `data:image/svg+xml;base64,${typeof btoa === 'function' ? btoa(PIN_SVG) : ''}`,
  iconSize: [28, 38],
  iconAnchor: [14, 38],
  popupAnchor: [0, -34],
});

export function RestaurantMap({ restaurants, center, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  // Kept in a ref so the marker click handlers below always call the latest callback
  // without having to tear down and rebuild every marker when the parent re-renders.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const initial = center ?? { latitude: 39.5, longitude: -98.35 }; // continental US fallback
    const map = L.map(containerRef.current, { attributionControl: true }).setView(
      [initial.latitude, initial.longitude],
      center ? 12 : 4
    );
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = [];
    };
  }, [center]);

  // Re-sync pins whenever the restaurant list changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = restaurants.map((r) => {
      const marker = L.marker([r.latitude, r.longitude], { icon: pinIcon, title: r.name }).addTo(map);
      const distance = r.distanceMiles != null ? ` · ${r.distanceMiles} mi` : '';
      const cuisine = r.cuisine ? r.cuisine.name : '';
      // Text is escaped by textContent below rather than interpolated into HTML — a
      // restaurant's own name is user-controlled and would otherwise be an injection point.
      const popup = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = r.name;
      const meta = document.createElement('div');
      meta.textContent = `${cuisine}${distance}`;
      meta.style.cssText = 'font-size:12px;color:#65635d;margin-top:2px;';
      const button = document.createElement('button');
      button.textContent = 'View profile';
      button.style.cssText =
        'margin-top:8px;padding:6px 12px;border:0;border-radius:100px;background:#c58300;color:#fff;font-weight:700;cursor:pointer;';
      button.onclick = () => onSelectRef.current(r.id);
      popup.append(title, meta, button);

      marker.bindPopup(popup);
      return marker;
    });

    // Fit all pins in view when there are several, so the user isn't left zoomed into one.
    if (restaurants.length > 1) {
      map.fitBounds(
        L.latLngBounds(restaurants.map((r) => [r.latitude, r.longitude] as [number, number])),
        { padding: [40, 40], maxZoom: 14 }
      );
    }
  }, [restaurants]);

  return (
    <View style={styles.wrap}>
      {/* A plain div, not a View: Leaflet needs a real DOM node to mount into. */}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.paper2, overflow: 'hidden' },
});
