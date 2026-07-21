import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { colors, fonts } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import { StoryGroup } from '../api/types';
import * as storiesApi from '../api/stories';
import { useAuth } from '../context/AuthContext';
import { alert } from '../utils/alert';

const RING_SIZE = 64;
const RING_GAP = 3;
const AVATAR_SIZE = RING_SIZE - RING_GAP * 4;

function isVideoAsset(asset: ImagePicker.ImagePickerAsset): boolean {
  return asset.type === 'video' || /\.(mp4|mov|m4v|webm)$/i.test(asset.uri);
}

export function StoryTray() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { business } = useAuth();
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [posting, setPosting] = useState(false);

  const load = useCallback(() => {
    storiesApi
      .getStories()
      .then((res) => setGroups(res.groups))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addStory = async () => {
    if (!business || posting) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      alert('Permission needed', 'Allow photo library access to post a story.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.85 });
    if (result.canceled || result.assets.length === 0) return;

    const asset = result.assets[0];
    const isVideo = isVideoAsset(asset);
    setPosting(true);
    try {
      await storiesApi.createStory({
        uri: asset.uri,
        fileName: asset.fileName ?? (isVideo ? 'story.mp4' : 'story.jpg'),
        mimeType: asset.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg'),
      });
      load();
    } catch {
      alert('Couldn’t post story', 'Something went wrong. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  const openViewer = (index: number) => {
    navigation.navigate('StoryViewer', { groups, startIndex: index });
  };

  if (!business && groups.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
      accessibilityLabel="Stories"
    >
      {business && (
        <Pressable
          style={styles.item}
          onPress={addStory}
          disabled={posting}
          accessibilityRole="button"
          accessibilityLabel="Add to your story"
        >
          <View style={[styles.ring, styles.addRing]}>
            {posting ? (
              <ActivityIndicator color={colors.gold} />
            ) : (
              <>
                <Avatar uri={business.avatarUrl} name={business.name} size={AVATAR_SIZE} />
                <View style={styles.plusBadge}>
                  <Icon name="plus" color={colors.white} size={11} />
                </View>
              </>
            )}
          </View>
          <Text style={styles.label} numberOfLines={1}>
            Your Story
          </Text>
        </Pressable>
      )}

      {groups.map((group, index) => (
        <Pressable
          key={group.business.id}
          style={styles.item}
          onPress={() => openViewer(index)}
          accessibilityRole="button"
          accessibilityLabel={`View ${group.business.name}'s story`}
        >
          {group.hasUnseen ? (
            <LinearGradient
              colors={[colors.gradientGoldStart, colors.gradientGoldEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ring}
            >
              <View style={styles.ringGap}>
                <Avatar uri={group.business.avatarUrl} name={group.business.name} size={AVATAR_SIZE} />
              </View>
            </LinearGradient>
          ) : (
            <View style={[styles.ring, styles.seenRing]}>
              <View style={styles.ringGap}>
                <Avatar uri={group.business.avatarUrl} name={group.business.name} size={AVATAR_SIZE} />
              </View>
            </View>
          )}
          <View style={styles.nameRow}>
            <Text style={styles.label} numberOfLines={1}>
              {group.business.name}
            </Text>
            {group.business.verified && <Icon name="checkBadge" color={colors.gold} size={11} />}
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 14, paddingVertical: 12, gap: 14, alignItems: 'flex-start' },
  item: { width: 72, alignItems: 'center', gap: 6 },
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringGap: {
    width: RING_SIZE - RING_GAP * 2,
    height: RING_SIZE - RING_GAP * 2,
    borderRadius: (RING_SIZE - RING_GAP * 2) / 2,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seenRing: { backgroundColor: colors.barNeutral },
  addRing: { backgroundColor: colors.paper2, borderWidth: 1, borderColor: colors.line },
  plusBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.gold,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 2, maxWidth: 72 },
  label: { fontSize: 11, color: colors.inkSoft2, fontFamily: fonts.body.medium, maxWidth: 68 },
});
