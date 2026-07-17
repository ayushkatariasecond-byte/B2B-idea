import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TextField } from '../components/TextField';
import { PrimaryButton } from '../components/PrimaryButton';
import { Avatar } from '../components/Avatar';
import { colors, fonts } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
import * as businessesApi from '../api/businesses';
import { ApiError } from '../api/client';

type Props = NativeStackScreenProps<RootStackParamList, 'EditProfile'>;

export function EditProfileScreen({ navigation }: Props) {
  const { business, setBusiness } = useAuth();
  const [name, setName] = useState(business?.name ?? '');
  const [category, setCategory] = useState(business?.category ?? '');
  const [bio, setBio] = useState(business?.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(business?.avatarUrl ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!business) return null;

  const pickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [1, 1] });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    try {
      const res = await businessesApi.updateAvatar({
        uri: asset.uri,
        fileName: asset.fileName ?? 'avatar.jpg',
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
      setAvatarUrl(res.business.avatarUrl);
      setBusiness(res.business);
    } catch (e) {
      Alert.alert('Upload failed', e instanceof ApiError ? e.message : 'Please try again.');
    }
  };

  const submit = async () => {
    setError(null);
    if (!name.trim() || !category.trim()) {
      setError('Name and category are required.');
      return;
    }
    setSaving(true);
    try {
      const res = await businessesApi.updateMe({ name: name.trim(), category: category.trim(), bio: bio.trim() });
      setBusiness(res.business);
      navigation.goBack();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={{ width: 50 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Pressable style={styles.avatarWrap} onPress={pickAvatar}>
          <Avatar uri={avatarUrl} name={name || business.name} size={88} />
          <Text style={styles.avatarHint}>Change logo</Text>
        </Pressable>

        <TextField label="Business name" value={name} onChangeText={setName} autoCapitalize="words" />
        <TextField label="Category" value={category} onChangeText={setCategory} autoCapitalize="words" />
        <TextField label="Bio" value={bio} onChangeText={setBio} multiline style={styles.bioInput} />

        {error && <Text style={styles.error}>{error}</Text>}

        <PrimaryButton label="Save changes" onPress={submit} loading={saving} style={styles.save} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: { paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cancel: { fontSize: 15, color: colors.inkSoft, fontFamily: fonts.body.semiBold },
  headerTitle: { fontFamily: fonts.display.bold, fontSize: 16, color: colors.ink },
  body: { padding: 20, gap: 16 },
  avatarWrap: { alignItems: 'center', gap: 8, marginBottom: 8 },
  avatarHint: { color: colors.gold, fontFamily: fonts.body.bold, fontSize: 13 },
  bioInput: { height: 90, paddingTop: 12, textAlignVertical: 'top' },
  error: { color: '#b3261e', fontFamily: fonts.body.semiBold, fontSize: 13 },
  save: { marginTop: 4 },
});
