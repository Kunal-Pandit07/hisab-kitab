import { useColorScheme } from 'react-native';
import { useApp } from '../hooks/useApp';

const base = { primary: '#176B4D', darkGreen: '#104B38', mint: '#EAF5EF', income: '#25845B', expense: '#D95757', gold: '#D8AE4A' };
export const lightTheme = { ...base, bg: '#FFFFFF', bg2: '#F7F9F7', text: '#202522', text2: '#737B75', divider: '#E7ECE8', card: '#FFFFFF', onPrimary: '#FFFFFF', dark: false };
export const darkTheme = { ...base, mint: '#183A2D', income: '#4CC38A', expense: '#F07C7C', bg: '#101412', bg2: '#171C19', text: '#ECF1ED', text2: '#9AA59D', divider: '#26302A', card: '#171C19', onPrimary: '#FFFFFF', dark: true };
export type Theme = typeof lightTheme;
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const radius = { sm: 10, md: 16, lg: 24 };

export function useTheme(): Theme {
  const system = useColorScheme();
  const pref = useApp().settings.theme;
  return (pref === 'system' ? system === 'dark' : pref === 'dark') ? darkTheme : lightTheme;
}
