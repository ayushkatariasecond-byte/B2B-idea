import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TextField } from '../components/TextField';
import { PrimaryButton } from '../components/PrimaryButton';
import { Icon } from '../components/Icon';
import { colors, fonts, radius } from '../theme/tokens';
import { RootStackParamList } from '../navigation/types';
import { TeamMember } from '../api/types';
import * as teamApi from '../api/team';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../api/client';
import { alert } from '../utils/alert';

type Props = NativeStackScreenProps<RootStackParamList, 'TeamMembers'>;

export function TeamMembersScreen({ navigation }: Props) {
  const { isOwner } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await teamApi.getTeamMembers();
      setMembers(res.members);
      setLoadError(null);
    } catch {
      setLoadError("Couldn't load your team. Check your connection and try again.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const invite = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    setInviting(true);
    try {
      await teamApi.inviteTeamMember({ email: email.trim(), password });
      setEmail('');
      setPassword('');
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally {
      setInviting(false);
    }
  };

  const remove = (member: TeamMember) => {
    alert('Remove teammate?', `${member.email} will no longer be able to log in to this page.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await teamApi.removeTeamMember(member.id);
          load();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} accessibilityLabel="Go back" accessibilityRole="button">
          <Icon name="chevronLeft" color={colors.backIcon} size={9} />
        </Pressable>
        <Text style={styles.title}>Team</Text>
        <View style={{ width: 20 }} />
      </View>

      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          isOwner ? (
            <View style={styles.inviteCard}>
              <Text style={styles.sectionLabel}>Invite a teammate</Text>
              <TextField label="Email" placeholder="teammate@company.com" value={email} onChangeText={setEmail} keyboardType="email-address" />
              <TextField label="Temporary password" placeholder="At least 8 characters" value={password} onChangeText={setPassword} secureTextEntry />
              {error && <Text style={styles.error}>{error}</Text>}
              <PrimaryButton label="Invite" onPress={invite} loading={inviting} variant="secondary" />
            </View>
          ) : (
            <Text style={styles.notice}>Only the page owner can invite or remove teammates.</Text>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowEmail}>{item.email}</Text>
              <Text style={styles.rowRole}>{item.role}</Text>
            </View>
            {isOwner && (
              <Pressable onPress={() => remove(item)} hitSlop={8} accessibilityLabel={`Remove ${item.email}`} accessibilityRole="button">
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            )}
          </View>
        )}
        ListEmptyComponent={
          <View>
            <Text style={styles.emptyText}>{loadError ?? 'No teammates yet.'}</Text>
            {loadError && (
              <Pressable onPress={load} hitSlop={10} accessibilityRole="button">
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            )}
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: { paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.display.bold, fontSize: 18, color: colors.ink },
  list: { padding: 18, gap: 10 },
  inviteCard: { backgroundColor: colors.paper2, borderRadius: radius.lg, padding: 16, gap: 12, marginBottom: 18 },
  sectionLabel: { fontFamily: fonts.body.bold, fontSize: 13, color: colors.ink },
  error: { color: '#b3261e', fontFamily: fonts.body.semiBold, fontSize: 13 },
  notice: { color: colors.inkSoft, fontFamily: fonts.body.medium, fontSize: 13, marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowEmail: { fontSize: 14, color: colors.ink, fontFamily: fonts.body.semiBold },
  rowRole: { fontSize: 12, color: colors.inkSoft2, marginTop: 2, textTransform: 'capitalize' },
  removeText: { color: '#b3261e', fontFamily: fonts.body.bold, fontSize: 13 },
  emptyText: { color: colors.inkSoft2, textAlign: 'center', fontFamily: fonts.body.medium, marginTop: 20 },
  retryText: { color: colors.gold, textAlign: 'center', fontFamily: fonts.body.bold, fontSize: 14, marginTop: 10 },
});
