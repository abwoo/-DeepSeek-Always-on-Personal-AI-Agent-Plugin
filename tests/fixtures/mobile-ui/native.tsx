// Browser-only host adapter for testing the actual mobile React components/hooks.
// This does NOT test native layout, OS storage, OIDC, notifications or physical devices.
import React from 'react';
const flat = (style: any): any =>
  Array.isArray(style) ? Object.assign({}, ...style.map(flat)) : style || {};
const box = ({ children, style, testID, ...p }: any) => (
  <div data-testid={testID} style={flat(style)}>
    {children}
  </div>
);
export const View = box,
  ScrollView = box,
  KeyboardAvoidingView = box,
  SafeAreaView = box;
export const SafeAreaProvider = ({ children }: any) => <>{children}</>;
export const Text = ({ children, style, accessibilityRole, ...p }: any) => (
  <div role={accessibilityRole} style={flat(style)}>
    {children}
  </div>
);
export const Pressable = ({
  children,
  onPress,
  disabled,
  style,
  accessibilityRole,
  accessibilityLabel,
  accessibilityState,
}: any) => (
  <button
    type="button"
    role={accessibilityRole}
    aria-label={accessibilityLabel}
    aria-selected={accessibilityState?.selected}
    onClick={onPress}
    disabled={disabled}
    style={flat(style)}
  >
    {children}
  </button>
);
export const TextInput = ({
  accessibilityLabel,
  value,
  onChangeText,
  multiline,
  style,
  secureTextEntry,
  maxLength,
}: any) =>
  React.createElement(multiline ? 'textarea' : 'input', {
    'aria-label': accessibilityLabel,
    value,
    maxLength,
    onChange: (e: any) => onChangeText(e.target.value),
    style: flat(style),
    ...(secureTextEntry ? { type: 'password' } : {}),
  });
export const Switch = ({ value, onValueChange, accessibilityLabel }: any) => (
  <input
    aria-label={accessibilityLabel}
    type="checkbox"
    checked={value}
    onChange={(e) => onValueChange(e.target.checked)}
  />
);
export const StatusBar = () => null;
export const StyleSheet = { create: (x: any) => x, hairlineWidth: 1 };
export const useColorScheme = () => 'light';
export const AppState = { currentState: 'active', addEventListener: () => ({ remove() {} }) };
export const Platform = { OS: 'android' };
export const Linking = { openURL: async () => {} };
export const Alert = {
  alert: (_title: any, _body: any, buttons: any[]) =>
    buttons?.find((b) => b.text === 'Dismiss')?.onPress?.(),
};
export const Share = {
  share: async () => {
    throw Error('Unbounded message sharing is forbidden in this fixture');
  },
};
export default function DateTimePicker({ value, onChange, mode }: any) {
  return (
    <input
      aria-label={'Native ' + mode + ' adapter'}
      type={mode === 'date' ? 'date' : 'time'}
      onChange={(e) => {
        const d = new Date(value);
        if (mode === 'date') {
          const [y, m, day] = e.target.value.split('-').map(Number);
          d.setFullYear(y, m - 1, day);
        } else {
          const [h, m] = e.target.value.split(':').map(Number);
          d.setHours(h, m);
        }
        onChange({}, d);
      }}
    />
  );
}
