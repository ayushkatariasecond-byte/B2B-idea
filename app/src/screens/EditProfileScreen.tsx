import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TextField } from '../components/TextField';
import { PrimaryButton } from '../components/PrimaryButton';
import { Chip } from '../components/Chip';
import { Avatar } from '../components/Avatar';
import { colors, fonts, radius } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
import * as businessesApi from '../api/businesses';
import { ApiError } from '../api/client';
import { alert } from '../utils/alert';
import { Cuisine, MenuItem } from '../api/types';

type Props = NativeStackScreenProps<RootStackParamList, 'EditProfile'>;

export function EditProfileScreen({ navigation }: Props) {
  const { business, setBusiness } = useAuth();
  const [name, setName] = useState(business?.name ?? '');
  const [category, setCategory] = useState(business?.category ?? '');
  const [bio, setBio] = useState(business?.bio ?? '');
  const [city, setCity] = useState(business?.city ?? '');
  const [website, setWebsite] = useState(business?.website ?? '');
  const [cuisines, setCuisines] = useState<Cuisine[]>([]);
  const [cuisineSlug, setCuisineSlug] = useState<string | null>(business?.cuisine?.slug ?? null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>(business?.menuItems ?? []);
  const [avatarUrl, setAvatarUrl] = useState(business?.avatarUrl ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRestaurant = business?.isRestaurant ?? false;

  useEffect(() => {
    if (isRestaurant) businessesApi.getCuisines().then((res) => setCuisines(res.cuisines));
  }, [isRestaurant]);

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
      alert('Upload failed', e instanceof ApiError ? e.message : 'Please try again.');
    }
  };

  const addMenuItem = () => setMenuItems((prev) => [...prev, { name: '', price: 0 }]);
  const removeMenuItem = (index: number) => setMenuItems((prev) => prev.filter((_, i) => i !== index));
  const updateMenuItem = (index: number, patch: Partial<MenuItem>) =>
    setMenuItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const submit = async () => {
    setError(null);
    if (!name.trim() || (!isRestaurant && !category.trim())) {
      setError('Name and category are required.');
      return;
    }
    if (!city.trim()) {
      setError('City is required.');
      return;
    }
    const cleanMenuItems = menuItems
      .map((item) => ({ ...item, name: item.name.trim() }))
      .filter((item) => item.name.length > 0);

    setSaving(true);
    try {
      const res = await businessesApi.updateMe({
        name: name.trim(),
        bio: bio.trim(),
        city: city.trim(),
        ...(isRestaurant
          ? { website: website.trim(), cuisineSlug: cuisineSlug ?? undefined, menuItems: cleanMenuItems }
          : { category: category.trim() }),
      });
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
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Cancel">
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={{ width: 50 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Pressable style={styles.avatarWrap} onPress={pickAvatar} accessibilityRole="button" accessibilityLabel="Change business logo">
          <Avatar uri={avatarUrl} name={name || business.name} size={88} />
          <Text style={styles.avatarHint}>Change logo</Text>
        </Pressable>

        <TextField label={isRestaurant ? 'Restaurant name' : 'Name'} value={name} onChangeText={setName} autoCapitalize="words" />
        <TextField label="City" value={city} onChangeText={setCity} autoCapitalize="words" />

        {isRestaurant ? (
          <>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Cuisine type</Text>
              <View style={styles.chipWrap}>
                {cuisines.map((c) => (
                  <Chip key={c.id} label={c.name} active={c.slug === cuisineSlug} onPress={() => setCuisineSlug(c.slug)} />
                ))}
              </View>
            </View>
            <TextField
              label="Website / ordering link"
              placeholder="https://"
              value={website}
              onChangeText={setWebsite}
              keyboardType="url"
              autoCapitalize="none"
            />
          </>
        ) : (
          <TextField label="Category" value={category} onChangeText={setCategory} autoCapitalize="words" />
        )}

        <TextField label="Bio" value={bio} onChangeText={setBio} multiline style={styles.bioInput} />

        {isRestaurant && (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Menu</Text>
            {menuItems.map((item, index) => (
              <View key={index} style={styles.menuRow}>
                <View style={styles.menuRowTop}>
                  <View style={styles.menuNameInput}>
                    <TextField
                      label="Item"
                      placeholder="Brisket Plate"
                      value={item.name}
                      onChangeText={(v) => updateMenuItem(index, { name: v })}
                      autoCapitalize="words"
                    />
                  </View>
                  <View style={styles.menuPriceInput}>
                    <TextField
                      label="Price"
                      placeholder="18.50"
                      value={item.price ? String(item.price) : ''}
                      onChangeText={(v) => updateMenuItem(index, { price: Number(v.replace(/[^0-9.]/g, '')) || 0 })}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
                <TextField
                  label="Description (optional)"
                  placeholder="Half pound, choice of two sides"
                  value={item.description ?? ''}
                  onChangeText={(v) => updateMenuItem(index, { description: v })}
                />
                <Text style={styles.removeItem} onPress={() => removeMenuItem(index)}>
                  Remove item
                </Text>
              </View>
            ))}
            <Text style={styles.addItem} onPress={addMenuItem}>
              + Add menu item
            </Text>
          </View>
        )}

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
  field: { gap: 8 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontFamily: fonts.body.bold,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  menuRow: { gap: 10, padding: 14, borderRadius: radius.smd, backgroundColor: colors.surfaceMuted, marginBottom: 4 },
  menuRowTop: { flexDirection: 'row', gap: 10 },
  menuNameInput: { flex: 2 },
  menuPriceInput: { flex: 1 },
  removeItem: { color: '#b3261e', fontFamily: fonts.body.semiBold, fontSize: 12, alignSelf: 'flex-start' },
  addItem: { color: colors.gold, fontFamily: fonts.body.bold, fontSize: 14, marginTop: 4 },
  error: { color: '#b3261e', fontFamily: fonts.body.semiBold, fontSize: 13 },
  save: { marginTop: 4 },
});
