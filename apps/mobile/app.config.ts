import type { ExpoConfig } from 'expo/config';
const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
const config: ExpoConfig = {
  name: 'DeepSeek Always-on',
  slug: 'deepseek-always-on',
  version: '0.2.0',
  scheme: 'deepseek-always-on',
  orientation: 'default',
  userInterfaceStyle: 'light',
  ios: { bundleIdentifier: 'com.abwoo.deepseekalwayson', supportsTablet: true },
  android: {
    package: 'com.abwoo.deepseekalwayson',
    ...(process.env.GOOGLE_SERVICES_FILE
      ? { googleServicesFile: process.env.GOOGLE_SERVICES_FILE }
      : {}),
    permissions: ['POST_NOTIFICATIONS'],
  },
  plugins: [
    'expo-secure-store',
    '@react-native-community/datetimepicker',
    ['expo-notifications', { defaultChannel: 'agent-updates' }],
  ],
  extra: {
    ...(projectId ? { eas: { projectId } } : {}),
    defaultAgentOrigin: process.env.EXPO_PUBLIC_AGENT_ORIGIN ?? '',
  },
};
export default config;
