import { NearbyRestaurant } from '../api/businesses';

/**
 * Shared type surface for the platform-split map component. Metro resolves the actual
 * implementation by extension at build time — `RestaurantMap.web.tsx` (Leaflet) on web,
 * `RestaurantMap.native.tsx` (distance-sorted list) on iOS/Android — but TypeScript can't
 * follow that resolution, so the contract both must satisfy is declared here.
 */
export interface RestaurantMapProps {
  restaurants: NearbyRestaurant[];
  center: { latitude: number; longitude: number } | null;
  onSelect: (restaurantId: string) => void;
}

export declare function RestaurantMap(props: RestaurantMapProps): JSX.Element;
