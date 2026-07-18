import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Icon } from '../components/Icon';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, fonts, radius } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
import * as businessesApi from '../api/businesses';
import { alert } from '../utils/alert';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const { business, isOwner, logout, setBusiness } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [requestingVerification, setRequestingVerification] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!business) return null;

  const exportData = async () => {
    setExporting(true);
    try {
      const data = await businessesApi.exportMyData();
      const json = JSON.stringify(data, null, 2);
      if (Platform.OS === 'web') {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'verve-data-export.json';
        link.click();
        URL.revokeObjectURL(url);
      } else {
        await Share.share({ message: json, title: 'Verve data export' });
      }
    } catch {
      alert('Couldn’t export data', 'Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const requestVerification = async () => {
    setRequestingVerification(true);
    try {
      const res = await businessesApi.requestVerification();
      setBusiness(res.business);
      alert('Request sent', 'We’ll review your business page and follow up.');
    } finally {
      setRequestingVerification(false);
    }
  };

  const deleteAccount = () => {
    alert(
      'Delete your account?',
      'This permanently deletes your business page, posts, and messages. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await businessesApi.deleteMyAccount();
              await logout();
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} accessibilityLabel="Go back" accessibilityRole="button">
          <Icon name="chevronLeft" color={colors.backIcon} size={9} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Verification</Text>
          {business.verified ? (
            <Text style={styles.sectionBody}>Your business page is verified.</Text>
          ) : business.verificationRequested ? (
            <Text style={styles.sectionBody}>Verification requested — we’ll review it soon.</Text>
          ) : (
            <>
              <Text style={styles.sectionBody}>Verified pages get a badge shown to buyers. Request a manual review below.</Text>
              <PrimaryButton
                label="Request verification"
                variant="secondary"
                onPress={requestVerification}
                loading={requestingVerification}
                style={styles.button}
              />
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your data</Text>
          <Text style={styles.sectionBody}>Download a copy of everything tied to your account — posts, comments, likes, follows, and messages.</Text>
          <PrimaryButton label="Download my data" variant="secondary" onPress={exportData} loading={exporting} style={styles.button} />
        </View>

        <View style={styles.section}>
          <PrimaryButton label="Log out" variant="secondary" onPress={logout} style={styles.button} />
        </View>

        {isOwner && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Danger zone</Text>
            <Text style={styles.sectionBody}>Permanently delete your business page and all of its content.</Text>
            <Pressable style={styles.deleteButton} onPress={deleteAccount} disabled={deleting} accessibilityRole="button">
              <Text style={styles.deleteButtonText}>{deleting ? 'Deleting…' : 'Delete my account'}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: { paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.display.bold, fontSize: 18, color: colors.ink },
  body: { padding: 20, gap: 24 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 13, fontFamily: fonts.body.bold, color: colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.4 },
  sectionBody: { fontSize: 14, color: colors.bodyText, lineHeight: 20, fontFamily: fonts.body.regular },
  button: { marginTop: 4, height: 44 },
  deleteButton: {
    marginTop: 4,
    height: 44,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#b3261e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: { color: '#b3261e', fontFamily: fonts.body.bold, fontSize: 14 },
});
