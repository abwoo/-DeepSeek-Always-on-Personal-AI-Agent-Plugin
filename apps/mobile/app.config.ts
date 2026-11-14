import type { ExpoConfig } from 'expo/config';
const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
const config: ExpoConfig = {
  name: 'DeepSeek Always-on',
  slug: 'deepseek-always-on',
  version: '0.3.0',
  scheme: 'deepseek-always-on',
  orientation: 'default',
  userInterfaceStyle: 'automatic',
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
    'expo-web-browser',
    '@react-native-community/datetimepicker',
    ['expo-notifications', { defaultChannel: 'agent-updates' }],
  ],
  extra: {
    ...(projectId ? { eas: { projectId } } : {}),
    serviceOrigin: require('../../config/public-service.json').serviceOrigin ?? '',
  },
};
export default config;
