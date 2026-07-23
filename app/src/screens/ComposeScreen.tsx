import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '../components/Icon';
import { colors, fonts, radius } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import { POST_TAGS } from '../api/types';
import * as postsApi from '../api/posts';
import { ApiError } from '../api/client';
import { generateVideoThumbnail, ThumbnailFile } from '../utils/videoThumbnail';
import { alert } from '../utils/alert';

type Props = NativeStackScreenProps<RootStackParamList, 'Compose'>;

function isVideoAsset(asset: ImagePicker.ImagePickerAsset): boolean {
  return asset.type === 'video' || /\.(mp4|mov|m4v|webm)$/i.test(asset.uri);
}

type PostMode = 'now' | 'draft' | 'schedule';

interface SchedulePreset {
  label: string;
  compute: () => Date;
}

const SCHEDULE_PRESETS: SchedulePreset[] = [
  { label: 'In 1 hour', compute: () => new Date(Date.now() + 60 * 60 * 1000) },
  {
    label: 'Tonight 6pm',
    compute: () => {
      const d = new Date();
      d.setHours(18, 0, 0, 0);
      if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
      return d;
    },
  },
  {
    label: 'Tomorrow 9am',
    compute: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
];

function TagChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  if (active) {
    return (
      <Pressable onPress={onPress}>
        <LinearGradient
          colors={[colors.gradientGoldStart, colors.gradientGoldEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.tagChip}
        >
          <Text style={[styles.tagChipText, styles.tagChipTextActive]}>{label}</Text>
        </LinearGradient>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} style={[styles.tagChip, styles.tagChipInactive]}>
      <Text style={[styles.tagChipText, styles.tagChipTextInactive]}>{label}</Text>
    </Pressable>
  );
}

export function ComposeScreen({ navigation }: Props) {
  const [media, setMedia] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [thumbnail, setThumbnail] = useState<ThumbnailFile | null>(null);
  const [generatingThumbnail, setGeneratingThumbnail] = useState(false);
  const [caption, setCaption] = useState('');
  const [tag, setTag] = useState(POST_TAGS[0]);
  const [posting, setPosting] = useState(false);
  const [mode, setMode] = useState<PostMode>('now');
  const [scheduledFor, setScheduledFor] = useState<Date | null>(null);

  const isVideo = media ? isVideoAsset(media) : false;

  const pickMedia = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      alert('Permission needed', 'Allow photo library access to attach media.');
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
      alert('Add media', 'Pick a photo or video before posting.');
      return;
    }
    if (mode === 'schedule' && !scheduledFor) {
      alert('Pick a time', 'Choose when this post should go out.');
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
        status: mode === 'now' ? 'published' : mode === 'draft' ? 'draft' : 'scheduled',
        scheduledFor: mode === 'schedule' ? scheduledFor!.toISOString() : undefined,
      });
      navigation.goBack();
    } catch (e) {
      alert('Couldn’t post', e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  const actionLabel = { now: 'Post', draft: 'Save Draft', schedule: 'Schedule' }[mode];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <Text style={styles.headerTitle}>New Post</Text>
        <Pressable onPress={submit} disabled={posting} accessibilityRole="button" style={posting && styles.postButtonDisabled}>
          <LinearGradient
            colors={[colors.gradientGoldStart, colors.gradientGoldEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.postButton}
          >
            <Text style={styles.postButtonText}>{posting ? 'Saving…' : actionLabel}</Text>
          </LinearGradient>
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
            placeholder="Fresh off the grill tonight..."
            placeholderTextColor={colors.inkMuted}
            value={caption}
            onChangeText={setCaption}
            multiline
          />
        </View>

        <View style={styles.tipBanner}>
          <LinearGradient
            colors={[colors.gradientGoldStart, colors.gradientGoldEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.tipIconTile}
          >
            <Icon name="trophy" color={colors.white} size={19} />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={styles.tipTitle}>Boost your creativity score</Text>
            <Text style={styles.tipSubtitle}>Original formats and bold hooks rank higher in For You.</Text>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Tag</Text>
          <View style={styles.tagRow}>
            {POST_TAGS.map((t) => (
              <TagChip key={t} label={t} active={t === tag} onPress={() => setTag(t)} />
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>When</Text>
          <View style={styles.tagRow}>
            <TagChip label="Post now" active={mode === 'now'} onPress={() => setMode('now')} />
            <TagChip label="Save as draft" active={mode === 'draft'} onPress={() => setMode('draft')} />
            <TagChip label="Schedule for later" active={mode === 'schedule'} onPress={() => setMode('schedule')} />
          </View>
          {mode === 'schedule' && (
            <View style={styles.scheduleRow}>
              {SCHEDULE_PRESETS.map((preset) => {
                const presetDate = preset.compute();
                const active = scheduledFor?.getTime() === presetDate.getTime();
                return (
                  <TagChip
                    key={preset.label}
                    label={preset.label}
                    active={active}
                    onPress={() => setScheduledFor(preset.compute())}
                  />
                );
              })}
            </View>
          )}
          {mode === 'schedule' && scheduledFor && (
            <Text style={styles.scheduleConfirm}>
              Will post {scheduledFor.toLocaleDateString()} at {scheduledFor.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  cancel: { fontSize: 15, color: colors.inkSoft, fontFamily: fonts.body.semiBold },
  headerTitle: { fontFamily: fonts.display.bold, fontSize: 16, color: colors.ink },
  postButton: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.gradientGoldEnd,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 4,
  },
  postButtonDisabled: { opacity: 0.6 },
  postButtonText: { color: colors.white, fontFamily: fonts.body.bold, fontSize: 14 },
  body: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: 24, gap: 18 },
  dropZone: {
    width: '100%',
    height: 340,
    borderRadius: radius.lg,
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
  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: fonts.body.bold },
  captionInput: {
    minHeight: 74,
    borderRadius: radius.smd,
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 13,
    paddingHorizontal: 15,
    fontSize: 14,
    color: colors.captionText,
    lineHeight: 22,
    fontFamily: fonts.body.regular,
    textAlignVertical: 'top',
  },
  tipBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.smd,
    backgroundColor: colors.bannerGoldBg,
    borderWidth: 1,
    borderColor: colors.bannerGoldBorder,
  },
  tipIconTile: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  tipTitle: { fontSize: 13, fontFamily: fonts.body.bold, color: colors.bannerGoldTitle },
  tipSubtitle: { fontSize: 12, color: colors.bannerGoldBody, marginTop: 2, lineHeight: 17, fontFamily: fonts.body.regular },
  tagRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  tagChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill },
  tagChipInactive: { backgroundColor: colors.surfaceMuted2 },
  tagChipText: { fontSize: 13 },
  tagChipTextActive: { fontFamily: fonts.body.bold, color: colors.white },
  tagChipTextInactive: { fontFamily: fonts.body.semiBold, color: colors.inkSoft },
  scheduleRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 10 },
  scheduleConfirm: { fontSize: 12, color: colors.inkSoft, marginTop: 8, fontFamily: fonts.body.medium },
});
