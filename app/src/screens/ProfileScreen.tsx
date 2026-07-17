import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BusinessProfileContent } from '../components/BusinessProfileContent';
import { BottomNav } from '../components/BottomNav';
import { colors, fonts, radius } from '../theme/tokens';
import { useAuth } from '../context/AuthContext';
import { Business, Post } from '../api/types';
import * as businessesApi from '../api/businesses';
import { RootStackParamList } from '../navigation/types';

export function ProfileScreen() {
  const { business: me } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [business, setBusiness] = useState<Business | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!me) return;
    const [businessRes, postsRes] = await Promise.all([businessesApi.getBusiness(me.id), businessesApi.getBusinessPosts(me.id)]);
    setBusiness(businessRes.business);
    setPosts(postsRes.posts);
    setLoading(false);
  }, [me]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading || !business) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BusinessProfileContent
        business={business}
        posts={posts}
        headerAction={
          <Pressable style={styles.editButton} onPress={() => navigation.navigate('EditProfile')}>
            <Text style={styles.editButtonText}>Edit profile</Text>
          </Pressable>
        }
      />
      <BottomNav active="profile" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  editButton: {
    backgroundColor: colors.paper2,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: radius.pill,
    marginBottom: 6,
  },
  editButtonText: { fontWeight: '700', fontSize: 13, color: colors.ink, fontFamily: fonts.body.bold },
});
