/**
 * Mobile UI Component Library
 * Native equivalents of web shadcn-ui components for React Native.
 * These components follow the same API patterns where possible.
 */

import { ReactNode, forwardRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
  TextInputProps,
  Switch as RNSwitch,
  Platform,
} from 'react-native';

// ─── Button ──────────────────────────────────────────────

interface ButtonProps {
  children: ReactNode;
  onPress: () => void;
  variant?: 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Button({
  children,
  onPress,
  variant = 'default',
  size = 'md',
  disabled = false,
  loading = false,
  style,
  textStyle,
}: ButtonProps) {
  const buttonStyles = [
    styles.button,
    styles[`button_${variant}`],
    styles[`button_size_${size}`],
    disabled && styles.button_disabled,
    style,
  ];

  const labelStyles = [
    styles.buttonText,
    styles[`buttonText_${variant}`],
    styles[`buttonText_size_${size}`],
    disabled && styles.buttonText_disabled,
    textStyle,
  ];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={buttonStyles}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'default' ? '#fff' : '#10b981'}
        />
      ) : (
        <Text style={labelStyles}>
          {typeof children === 'string' ? children : children}
        </Text>
      )}
    </TouchableOpacity>
  );
}

// ─── Card ────────────────────────────────────────────────

interface CardProps {
  children: ReactNode;
  style?: ViewStyle;
}

export function Card({ children, style }: CardProps) {
  return (
    <View
      style={[styles.card, style]}
      accessibilityRole="summary"
    >
      {children}
    </View>
  );
}

export function CardHeader({ children, style }: CardProps) {
  return <View style={[styles.cardHeader, style]}>{children}</View>;
}

export function CardTitle({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[styles.cardTitle, style]}>{children}</Text>;
}

export function CardDescription({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[styles.cardDescription, style]}>{children}</Text>;
}

export function CardContent({ children, style }: CardProps) {
  return <View style={[styles.cardContent, style]}>{children}</View>;
}

export function CardFooter({ children, style }: CardProps) {
  return <View style={[styles.cardFooter, style]}>{children}</View>;
}

// ─── Input ───────────────────────────────────────────────

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
}

export function Input({ label, error, containerStyle, style, ...props }: InputProps) {
  return (
    <View style={[styles.inputContainer, containerStyle]}>
      {label && <Text style={styles.inputLabel}>{label}</Text>}
      <TextInput
        style={[
          styles.input,
          error && styles.input_error,
          style as TextStyle,
        ]}
        placeholderTextColor="#a1a1aa"
        accessibilityLabel={label}
        accessibilityHint={error}
        {...props}
      />
      {error && <Text style={styles.inputError}>{error}</Text>}
    </View>
  );
}

// ─── Badge ───────────────────────────────────────────────

interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'outline' | 'destructive' | 'secondary';
  style?: ViewStyle;
}

export function Badge({ children, variant = 'default', style }: BadgeProps) {
  return (
    <View style={[styles.badge, styles[`badge_${variant}`], style]}>
      <Text style={[styles.badgeText, styles[`badgeText_${variant}`]]}>
        {children}
      </Text>
    </View>
  );
}

// ─── Separator ───────────────────────────────────────────

export function Separator({ style }: { style?: ViewStyle }) {
  return <View style={[styles.separator, style]} />;
}

// ─── Switch ──────────────────────────────────────────────

interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Switch({ value, onValueChange, label, disabled }: SwitchProps) {
  return (
    <View style={styles.switchContainer}>
      {label && <Text style={styles.switchLabel}>{label}</Text>}
      <RNSwitch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: '#e4e4e7', true: '#86efac' }}
        thumbColor={value ? '#10b981' : '#f4f3f4'}
        ios_backgroundColor="#e4e4e7"
        accessibilityLabel={label}
        accessibilityRole="switch"
      />
    </View>
  );
}

// ─── EmptyState ──────────────────────────────────────────

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      {icon && <Text style={styles.emptyStateIcon}>{icon}</Text>}
      <Text style={styles.emptyStateTitle}>{title}</Text>
      {description && <Text style={styles.emptyStateDescription}>{description}</Text>}
      {action && <View style={styles.emptyStateAction}>{action}</View>}
    </View>
  );
}

// ─── LoadingScreen ───────────────────────────────────────

export function LoadingScreen({ message }: { message?: string }) {
  return (
    <View style={styles.loadingScreen}>
      <ActivityIndicator size="large" color="#10b981" />
      {message && <Text style={styles.loadingText}>{message}</Text>}
    </View>
  );
}

// ─── Avatar ──────────────────────────────────────────────

interface AvatarProps {
  name: string;
  size?: number;
  color?: string;
}

export function Avatar({ name, size = 40, color }: AvatarProps) {
  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const bgColor = color || stringToColor(name);

  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor },
      ]}
      accessibilityLabel={`Avatar for ${name}`}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>{initials}</Text>
    </View>
  );
}

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899'];
  return colors[Math.abs(hash) % colors.length];
}

// ─── Toast ───────────────────────────────────────────────
// Note: For mobile, we use Alert.alert() or a simple snackbar pattern.
// Import Alert from react-native where needed.

// ─── Styles ──────────────────────────────────────────────

const styles = StyleSheet.create({
  // Button
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    gap: 8,
  },
  button_default: { backgroundColor: '#10b981' },
  button_outline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#e4e4e7' },
  button_ghost: { backgroundColor: 'transparent' },
  button_destructive: { backgroundColor: '#ef4444' },
  button_secondary: { backgroundColor: '#f4f4f5' },
  button_disabled: { opacity: 0.5 },
  button_size_sm: { paddingHorizontal: 12, paddingVertical: 6 },
  button_size_md: { paddingHorizontal: 16, paddingVertical: 10 },
  button_size_lg: { paddingHorizontal: 24, paddingVertical: 14 },

  buttonText: { fontWeight: '600', textAlign: 'center' },
  buttonText_default: { color: '#ffffff' },
  buttonText_outline: { color: '#09090b' },
  buttonText_ghost: { color: '#09090b' },
  buttonText_destructive: { color: '#ffffff' },
  buttonText_secondary: { color: '#09090b' },
  buttonText_disabled: { color: '#a1a1aa' },
  buttonText_size_sm: { fontSize: 13 },
  buttonText_size_md: { fontSize: 15 },
  buttonText_size_lg: { fontSize: 17 },

  // Card
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e4e4e7',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
      },
      android: { elevation: 2 },
    }),
  },
  cardHeader: { padding: 16, paddingBottom: 8 },
  cardTitle: { fontSize: 18, fontWeight: '600', color: '#09090b' },
  cardDescription: { fontSize: 14, color: '#71717a', marginTop: 4 },
  cardContent: { padding: 16, paddingTop: 8 },
  cardFooter: { padding: 16, paddingTop: 8, flexDirection: 'row', alignItems: 'center' },

  // Input
  inputContainer: { marginBottom: 16 },
  inputLabel: { fontSize: 14, fontWeight: '500', color: '#09090b', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#e4e4e7',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 16,
    color: '#09090b',
    backgroundColor: '#ffffff',
  },
  input_error: { borderColor: '#ef4444' },
  inputError: { fontSize: 12, color: '#ef4444', marginTop: 4 },

  // Badge
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
    alignSelf: 'flex-start',
  },
  badge_default: { backgroundColor: '#10b981' },
  badge_outline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#e4e4e7' },
  badge_destructive: { backgroundColor: '#ef4444' },
  badge_secondary: { backgroundColor: '#f4f4f5' },
  badgeText: { fontSize: 12, fontWeight: '600' },
  badgeText_default: { color: '#ffffff' },
  badgeText_outline: { color: '#09090b' },
  badgeText_destructive: { color: '#ffffff' },
  badgeText_secondary: { color: '#09090b' },

  // Separator
  separator: { height: 1, backgroundColor: '#e4e4e7', marginVertical: 16 },

  // Switch
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: { fontSize: 15, color: '#09090b', flex: 1, marginRight: 12 },

  // EmptyState
  emptyState: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyStateIcon: { fontSize: 48, marginBottom: 16 },
  emptyStateTitle: { fontSize: 18, fontWeight: '600', color: '#09090b', textAlign: 'center' },
  emptyStateDescription: { fontSize: 14, color: '#71717a', textAlign: 'center', marginTop: 8 },
  emptyStateAction: { marginTop: 20 },

  // Loading
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 14, color: '#71717a', marginTop: 12 },

  // Avatar
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#ffffff', fontWeight: '700' },
});
