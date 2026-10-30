import { Redirect } from 'expo-router';
import { useApp } from '../src/hooks/useApp';

export default function Index() {
  const { settings } = useApp();
  return <Redirect href={settings.onboarded ? '/(tabs)' : '/onboarding'} />;
}
