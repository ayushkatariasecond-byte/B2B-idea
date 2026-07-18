import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius } from '../theme/tokens';

export interface AlertButtonConfig {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface AlertState {
  title: string;
  message?: string;
  buttons: AlertButtonConfig[];
}

let externalSetState: ((state: AlertState | null) => void) | null = null;

/** Web has no native alert/action-sheet UI (react-native-web's Alert.alert is a no-op), so this modal backs `alert()` on web. */
export function showAlert(title: string, message?: string, buttons?: AlertButtonConfig[]) {
  const resolvedButtons = buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }];
  externalSetState?.({ title, message, buttons: resolvedButtons });
}

export function AlertHost() {
  const [state, setState] = useState<AlertState | null>(null);

  useEffect(() => {
    externalSetState = setState;
    return () => {
      externalSetState = null;
    };
  }, []);

  const close = () => setState(null);

  const handlePress = (button: AlertButtonConfig) => {
    close();
    button.onPress?.();
  };

  return (
    <Modal visible={!!state} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          {state && (
            <>
              <Text style={styles.title}>{state.title}</Text>
              {state.message ? <Text style={styles.message}>{state.message}</Text> : null}
              <View style={styles.buttons}>
                {state.buttons.map((button, index) => (
                  <Pressable
                    key={`${button.text}-${index}`}
                    style={[styles.button, index > 0 && styles.buttonDivider]}
                    onPress={() => handlePress(button)}
                    accessibilityRole="button"
                  >
                    <Text
                      style={[
                        styles.buttonText,
                        button.style === 'destructive' && styles.destructiveText,
                        button.style === 'cancel' && styles.cancelText,
                      ]}
                    >
                      {button.text}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    paddingTop: 20,
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  title: { fontFamily: fonts.body.bold, fontSize: 16, color: colors.ink, textAlign: 'center' },
  message: { fontFamily: fonts.body.regular, fontSize: 13, color: colors.inkSoft, textAlign: 'center', marginTop: 8, lineHeight: 19 },
  buttons: { marginTop: 20, marginHorizontal: -20 },
  button: {
    paddingVertical: 14,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  buttonDivider: {},
  buttonText: { fontFamily: fonts.body.semiBold, fontSize: 15, color: colors.gold },
  cancelText: { color: colors.inkSoft, fontFamily: fonts.body.bold },
  destructiveText: { color: '#b3261e' },
});
