import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { zh } from './locales';
type Theme = 'system' | 'light' | 'dark';
const UiContext = createContext<any>(null);
export function UiProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme(),
    [language, setLanguage] = useState<'en' | 'zh'>(
      Intl.DateTimeFormat().resolvedOptions().locale.startsWith('zh') ? 'zh' : 'en',
    ),
    [theme, setTheme] = useState<Theme>('system');
  useEffect(() => {
    SecureStore.getItemAsync('always-on.ui.preferences')
      .then((v) => {
        if (!v) return;
        const p = JSON.parse(v);
        if (['en', 'zh'].includes(p.language)) setLanguage(p.language);
        if (['system', 'light', 'dark'].includes(p.theme)) setTheme(p.theme);
      })
      .catch(() => {});
  }, []);
  const dark = theme === 'dark' || (theme === 'system' && system === 'dark');
  const update = (lang: 'en' | 'zh', appearance: Theme) => {
    setLanguage(lang);
    setTheme(appearance);
    void SecureStore.setItemAsync(
      'always-on.ui.preferences',
      JSON.stringify({ language: lang, theme: appearance }),
    ).catch(() => {});
  };
  const t = (raw: string) => {
    const clean = raw.replace(/\s+/g, ' ').trim();
    if (language === 'en') return raw;
    const tick = clean.startsWith('✓ ') ? '✓ ' : '';
    return tick + (zh[clean.replace(/^✓ /, '')] ?? raw);
  };
  const value = {
    language,
    theme,
    dark,
    t,
    styles: makeStyles(dark),
    colors: { text: dark ? '#eef4fa' : '#17283a' },
    setLanguage: (l: 'en' | 'zh') => update(l, theme),
    setTheme: (m: Theme) => update(language, m),
  };
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}
export function useUi(): {
  language: 'en' | 'zh';
  theme: Theme;
  dark: boolean;
  t: (s: string) => string;
  styles: ReturnType<typeof makeStyles>;
  colors: { text: string };
  setLanguage: (l: 'en' | 'zh') => void;
  setTheme: (m: Theme) => void;
} {
  const v = useContext(UiContext);
  if (!v) throw Error('UI provider missing');
  return v;
}
function makeStyles(dark: boolean) {
  const c = (light: string) =>
    dark
      ? ((
          {
            '#f5f7fa': '#0e1721',
            '#ffffff': '#162331',
            '#fff': '#162331',
            '#17283a': '#eef4fa',
            '#516375': '#aebdcb',
            '#173f38': '#c6eee6',
            '#d9eee9': '#27483f',
            '#dbe2ea': '#344657',
            '#31475a': '#ccd9e5',
            '#9eadbb': '#617385',
            '#152739': '#f0f6fb',
            '#176c60': '#247f70',
            '#9d3e38': '#a74540',
            '#fae4e0': '#422422',
            '#8a2820': '#ffc5b8',
            '#5a6977': '#afbecd',
          } as Record<string, string>
        )[light] ?? light)
      : light;
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: c('#f5f7fa') },
    container: { padding: 18, paddingBottom: 32, gap: 14 },
    header: { padding: 18, paddingBottom: 10, backgroundColor: c('#ffffff'), gap: 5 },
    title: { fontSize: 27, fontWeight: '700', color: c('#17283a') },
    subtitle: { fontSize: 13, color: c('#516375'), lineHeight: 20 },
    tabs: { flexGrow: 0, backgroundColor: c('#fff'), maxHeight: 56 },
    tabContent: { paddingHorizontal: 12, paddingVertical: 5, gap: 8 },
    tab: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12 },
    selected: { backgroundColor: c('#d9eee9') },
    tabText: { color: c('#173f38'), fontWeight: '600' },
    card: {
      backgroundColor: c('#fff'),
      padding: 18,
      borderRadius: 16,
      gap: 12,
      borderColor: c('#dbe2ea'),
      borderWidth: 1,
    },
    heading: { fontSize: 18, fontWeight: '600', color: c('#17283a') },
    field: { gap: 6 },
    label: { fontSize: 14, color: c('#31475a'), fontWeight: '500' },
    input: {
      borderWidth: 1,
      borderColor: c('#9eadbb'),
      borderRadius: 10,
      minHeight: 48,
      padding: 12,
      fontSize: 16,
      color: c('#152739'),
      backgroundColor: c('#fff'),
    },
    multiline: { minHeight: 100, textAlignVertical: 'top' },
    button: {
      backgroundColor: c('#176c60'),
      borderRadius: 10,
      minHeight: 46,
      paddingHorizontal: 14,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    danger: { backgroundColor: c('#9d3e38') },
    disabled: { opacity: 0.4 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    flexText: { flex: 1, color: c('#31475a') },
    error: {
      padding: 14,
      borderRadius: 10,
      backgroundColor: c('#fae4e0'),
      color: c('#8a2820'),
      lineHeight: 21,
    },
    footnote: { fontSize: 12, color: c('#5a6977'), lineHeight: 19 },
    footer: {
      paddingHorizontal: 18,
      paddingVertical: 7,
      borderTopWidth: 1,
      borderTopColor: c('#dbe2ea'),
    },
  });
}
