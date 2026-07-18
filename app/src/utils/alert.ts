import { Alert, Platform } from 'react-native';
import { showAlert, AlertButtonConfig } from '../components/AlertHost';

export type AlertButton = AlertButtonConfig;

/** react-native-web's Alert.alert is a no-op, so this routes web through a custom modal (AlertHost) and native through the real Alert. */
export function alert(title: string, message?: string, buttons?: AlertButton[]) {
  if (Platform.OS === 'web') {
    showAlert(title, message, buttons);
  } else {
    Alert.alert(title, message, buttons);
  }
}
