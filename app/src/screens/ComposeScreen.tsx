import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '../components/Icon';
import { Chip } from '../components/Chip';
import { colors, fonts, radius } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import { POST_TAGS } from '../api/types';
import * as postsApi from '../api/posts';
import { ApiError } from '../api/client';
import { generateVideoThumbnail, ThumbnailFile } from '../utils/videoThumbnail';

type Props = NativeStackScreenProps<RootStackParamList, 'Compose'>;

function isVideoAsset(asset: ImagePicker.ImagePickerAsset): boolean {
  return asset.type === 'video' || /\.(mp4|mov|m4v|webm)$/i.test(asset.uri);
}

export function ComposeScreen({ navigation }: Props) {
  const [media, setMedia] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [thumbnail, setThumbnail] = useState<ThumbnailFile | null>(null);
  const [generatingThumbnail, setGeneratingThumbnail] = useState(false);
  const [caption, setCaption] = useState('');
  const [tag, setTag] = useState(POST_TAGS[0]);
  const [posting, setPosting] = useState(false);

  const isVideo = media ? isVideoAsset(media) : false;

  const pickMedia = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to attach media.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
    });
    if (result.canceled || result.assets.length === 0) return;

    const asset = result.assets[0];
    setMedia(asset);
    setThumbnail(null);

    if (isVideoAsset(asset)) {
      setGeneratingThumbnail(true);
      const thumb = await generateVideoThumbnail(asset.uri);
      setThumbnail(thumb);
      setGeneratingThumbnail(false);
    }
  };

  const submit = async () => {
    if (!media) {
      Alert.alert('Add media', 'Pick a photo or video before posting.');
      return;
    }
    setPosting(true);
    try {
      await postsApi.createPost({
        uri: media.uri,
        fileName: media.fileName ?? (isVideo ? 'upload.mp4' : 'upload.jpg'),
        mimeType: media.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg'),
        caption,
        tag,
        thumbnail: thumbnail ?? undefined,
      });
      navigation.goBack();
    } catch (e) {
      Alert.alert('Couldn’t post', e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <Text style={styles.headerTitle}>New Post</Text>
        <Pressable style={[styles.postButton, posting && styles.postButtonDisabled]} onPress={submit} disabled={posting}>
          <Text style={styles.postButtonText}>{posting ? 'Posting…' : 'Post'}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Pressable style={styles.dropZone} onPress={pickMedia}>
          {media && !isVideo ? (
            <Image source={{ uri: media.uri }} style={styles.dropZoneImage} contentFit="cover" />
          ) : media && isVideo ? (
            <>
              {thumbnail ? (
                <Image source={{ uri: thumbnail.uri }} style={styles.dropZoneImage} contentFit="cover" />
              ) : (
                <View style={[styles.dropZoneImage, styles.videoFallback]} />
              )}
              <View style={styles.playBadge}>
                {generatingThumbnail ? <ActivityIndicator color={colors.white} /> : <Icon name="send" color={colors.white} size={20} />}
              </View>
            </>
          ) : (
            <Text style={styles.dropZoneText}>Drop your video or image — 9:16 works best</Text>
          )}
        </Pressable>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Caption</Text>
          <TextInput
            style={styles.captionInput}
            placeholder="We taught a warehouse arm to dance..."
            placeholderTextColor={colors.inkSoft2}
            value={caption}
            onChangeText={setCaption}
            multiline
          />
        </View>

        <View style={styles.tipBanner}>
          <Icon name="star" color={colors.goldDeep} size={22} />
          <View style={{ flex: 1 }}>
            <Text style={styles.tipTitle}>Boost your creativity score</Text>
            <Text style={styles.tipSubtitle}>Original formats and bold hooks rank higher in For You.</Text>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Tag</Text>
          <View style={styles.tagRow}>
            {POST_TAGS.map((t) => (
              <Chip key={t} label={t} active={t === tag} onPress={() => setTag(t)} />
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cancel: { fontSize: 15, color: colors.inkSoft, fontFamily: fonts.body.semiBold },
  headerTitle: { fontFamily: fonts.display.bold, fontSize: 16, color: colors.ink },
  postButton: { backgroundColor: colors.gold, paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill },
  postButtonDisabled: { opacity: 0.6 },
  postButtonText: { color: colors.white, fontFamily: fonts.body.bold, fontSize: 14 },
  body: { padding: 18, gap: 16 },
  dropZone: {
    width: '100%',
    height: 340,
    borderRadius: radius.xl,
    backgroundColor: colors.paper2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  dropZoneImage: { width: '100%', height: '100%', position: 'absolute' },
  videoFallback: { backgroundColor: colors.dark },
  playBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropZoneText: { color: colors.inkSoft, fontFamily: fonts.body.medium, textAlign: 'center', paddingHorizontal: 30 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.4, fontFamily: fonts.body.bold },
  captionInput: {
    minHeight: 70,
    borderRadius: radius.md,
    backgroundColor: colors.paper3,
    padding: 14,
    fontSize: 14,
    color: colors.bodyText,
    lineHeight: 21,
    fontFamily: fonts.body.regular,
    textAlignVertical: 'top',
  },
  tipBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: colors.goldPale },
  tipTitle: { fontSize: 13, fontFamily: fonts.body.bold, color: colors.tipTitle },
  tipSubtitle: { fontSize: 12, color: colors.tipSubtitle, marginTop: 1, fontFamily: fonts.body.regular },
  tagRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
