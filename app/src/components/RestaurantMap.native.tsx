import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar } from './Avatar';
import { colors, fonts, radius } from '../theme/tokens';
import { NearbyRestaurant } from '../api/businesses';

/**
 * Native counterpart to RestaurantMap.web.tsx.
 *
 * Deliberately NOT a real map: rendering one on native would mean pulling in
 * react-native-maps, which needs a Google Maps API key on Android and a native rebuild —
 * neither of which exists yet, since native builds are a separate track from this
 * web-first launch. Shipping it unconfigured would produce a blank or crashing screen on
 * device, which is worse than not offering it.
 *
 * So native gets the useful half of the feature — the same nearby restaurants, sorted by
 * real distance, tappable through to the same profiles — without pretending to be a map.
 * When native builds happen, this file is the single place to swap in react-native-maps.
 */

interface Props {
  restaurants: NearbyRestaurant[];
  center: { latitude: number; longitude: number } | null;
  onSelect: (restaurantId: string) => void;
}

export function RestaurantMap({ restaurants, onSelect }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.notice}>Nearby restaurants, closest first</Text>
      <ScrollView contentContainerStyle={styles.list}>
        {restaurants.map((r) => (
          <Pressable
            key={r.id}
            style={styles.row}
            onPress={() => onSelect(r.id)}
            accessibilityRole="button"
            accessibilityLabel={`View ${r.name}`}
          >
            <Avatar uri={r.avatarUrl} name={r.name} size={44} />
            <View style={styles.rowText}>
              <Text style={styles.rowName} numberOfLines={1}>
                {r.name}
              </Text>
              <Text style={styles.rowMeta} numberOfLines={1}>
                {[r.cuisine?.name, r.distanceMiles != null ? `${r.distanceMiles} mi away` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.white },
  notice: {
    fontFamily: fonts.body.semiBold,
    fontSize: 12,
    color: colors.inkFaint,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.paper2,
  },
  rowText: { flex: 1, gap: 2 },
  rowName: { fontFamily: fonts.body.bold, fontSize: 15, color: colors.ink },
  rowMeta: { fontFamily: fonts.body.regular, fontSize: 13, color: colors.inkSoft },
});
