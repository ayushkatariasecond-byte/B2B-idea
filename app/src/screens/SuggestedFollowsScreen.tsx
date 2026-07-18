import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Avatar } from '../components/Avatar';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, fonts, radius } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import { Business } from '../api/types';
import * as businessesApi from '../api/businesses';
import { useAuth } from '../context/AuthContext';

type Props = NativeStackScreenProps<RootStackParamList, 'SuggestedFollows'>;

export function SuggestedFollowsScreen({ navigation }: Props) {
  const { clearJustSignedUp } = useAuth();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    businessesApi.getSuggested().then((res) => {
      setBusinesses(res.businesses);
      setLoading(false);
    });
  }, []);

  const toggle = async (business: Business) => {
    const isFollowed = followedIds.has(business.id);
    setFollowedIds((prev) => {
      const next = new Set(prev);
      if (isFollowed) next.delete(business.id);
      else next.add(business.id);
      return next;
    });
    await businessesApi.toggleFollow(business.id);
  };

  const finish = () => {
    clearJustSignedUp();
    navigation.replace('Tabs');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Follow a few businesses</Text>
        <Text style={styles.subtitle}>Your For You feed already has content, but following people fills in your Following tab too.</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : (
        <FlatList
          data={businesses}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const isFollowed = followedIds.has(item.id);
            return (
              <View style={styles.row}>
                <Avatar uri={item.avatarUrl} name={item.name} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.category}>{item.category}</Text>
                </View>
                <Pressable
                  style={[styles.followButton, isFollowed && styles.followingButton]}
                  onPress={() => toggle(item)}
                  accessibilityRole="button"
                  accessibilityLabel={isFollowed ? `Unfollow ${item.name}` : `Follow ${item.name}`}
                >
                  <Text style={[styles.followButtonText, isFollowed && styles.followingButtonText]}>
                    {isFollowed ? 'Following' : 'Follow'}
                  </Text>
                </Pressable>
              </View>
            );
          }}
        />
      )}

      <View style={styles.footer}>
        <PrimaryButton label="Continue" onPress={finish} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: { paddingHorizontal: 24, paddingTop: 12, gap: 8 },
  title: { fontFamily: fonts.display.bold, fontSize: 24, color: colors.ink },
  subtitle: { fontSize: 14, color: colors.inkSoft, lineHeight: 20, fontFamily: fonts.body.regular },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 20, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  name: { fontSize: 14, fontFamily: fonts.body.bold, color: colors.ink },
  category: { fontSize: 12, color: colors.inkSoft2, marginTop: 2 },
  followButton: { backgroundColor: colors.gold, paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill },
  followingButton: { backgroundColor: colors.paper2 },
  followButtonText: { fontSize: 13, fontFamily: fonts.body.bold, color: colors.white },
  followingButtonText: { color: colors.ink },
  footer: { padding: 20 },
});
