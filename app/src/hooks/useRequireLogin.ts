import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../navigation/types';
import { alert } from '../utils/alert';

/** Gates an action behind auth — lets logged-in users through, prompts logged-out visitors to log in. Used on public post/profile pages. */
export function useRequireLogin() {
  const { business } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return function requireLogin(action: () => void) {
    if (business) {
      action();
      return;
    }
    alert('Log in to continue', 'Create a free business page or log in to do that.', [
      { text: 'Not now', style: 'cancel' },
      { text: 'Log in', onPress: () => navigation.navigate('Login') },
    ]);
  };
}
