/**
 * Mobile UI Component Library
 * Native equivalents of web shadcn-ui components for React Native.
 * All components consume the MobileThemeProvider for dark/light mode support.
 */

import { ReactNode } from 'react';
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
import { useTheme } from '../../providers/MobileThemeProvider';

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
  const { colors } = useTheme();

  const bgMap: Record<string, string> = {
    default: colors.primary,
    outline: 'transparent',
    ghost: 'transparent',
    destructive: colors.destructive,
    secondary: colors.muted,
  };

  const borderMap: Record<string, string | undefined> = {
    outline: colors.border,
  };

  const textColorMap: Record<string, string> = {
    default: colors.primaryForeground,
    outline: colors.foreground,
    ghost: colors.foreground,
    destructive: colors.destructiveForeground,
    secondary: colors.foreground,
  };

  const paddingMap: Record<string, { h: number; v: number }> = {
    sm: { h: 12, v: 6 },
    md: { h: 16, v: 10 },
    lg: { h: 24, v: 14 },
  };

  const fontSizeMap: Record<string, number> = { sm: 13, md: 15, lg: 17 };
  const pad = paddingMap[size];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        buttonBase,
        {
          backgroundColor: bgMap[variant],
          paddingHorizontal: pad.h,
          paddingVertical: pad.v,
          borderWidth: borderMap[variant] ? 1 : 0,
          borderColor: borderMap[variant],
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'default' ? colors.primaryForeground : colors.primary}
        />
      ) : (
        <Text
          style={[
            {
              fontWeight: '600',
              textAlign: 'center',
              color: disabled ? colors.mutedForeground : textColorMap[variant],
              fontSize: fontSizeMap[size],
            },
            textStyle,
          ]}
        >
          {children}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const buttonBase: ViewStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
  gap: 8,
};

// ─── Card ────────────────────────────────────────────────

interface CardProps {
  children: ReactNode;
  style?: ViewStyle;
}

export function Card({ children, style }: CardProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
            android: { elevation: 2 },
          }),
        },
        style,
      ]}
      accessibilityRole="summary"
    >
      {children}
    </View>
  );
}

export function CardHeader({ children, style }: CardProps) {
  return <View style={[{ padding: 16, paddingBottom: 8 }, style]}>{children}</View>;
}

export function CardTitle({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const { colors } = useTheme();
  return <Text style={[{ fontSize: 18, fontWeight: '600', color: colors.foreground }, style]}>{children}</Text>;
}

export function CardDescription({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const { colors } = useTheme();
  return <Text style={[{ fontSize: 14, color: colors.mutedForeground, marginTop: 4 }, style]}>{children}</Text>;
}

export function CardContent({ children, style }: CardProps) {
  return <View style={[{ padding: 16, paddingTop: 8 }, style]}>{children}</View>;
}

export function CardFooter({ children, style }: CardProps) {
  return <View style={[{ padding: 16, paddingTop: 8, flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
}

// ─── Input ───────────────────────────────────────────────

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
}

export function Input({ label, error, containerStyle, style, ...props }: InputProps) {
  const { colors } = useTheme();
  return (
    <View style={[{ marginBottom: 16 }, containerStyle]}>
      {label && (
        <Text style={{ fontSize: 14, fontWeight: '500', color: colors.foreground, marginBottom: 6 }}>
          {label}
        </Text>
      )}
      <TextInput
        style={[
          {
            borderWidth: 1,
            borderColor: error ? colors.destructive : colors.border,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: Platform.OS === 'ios' ? 12 : 10,
            fontSize: 16,
            color: colors.foreground,
            backgroundColor: colors.background,
          },
          style as TextStyle,
        ]}
        placeholderTextColor={colors.mutedForeground}
        accessibilityLabel={label}
        accessibilityHint={error}
        {...props}
      />
      {error && (
        <Text style={{ fontSize: 12, color: colors.destructive, marginTop: 4 }}>{error}</Text>
      )}
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
  const { colors } = useTheme();

  const bgMap: Record<string, string> = {
    default: colors.primary,
    outline: 'transparent',
    destructive: colors.destructive,
    secondary: colors.muted,
  };

  const textMap: Record<string, string> = {
    default: colors.primaryForeground,
    outline: colors.foreground,
    destructive: colors.destructiveForeground,
    secondary: colors.foreground,
  };

  return (
    <View
      style={[
        {
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 9999,
          alignSelf: 'flex-start',
          backgroundColor: bgMap[variant],
          borderWidth: variant === 'outline' ? 1 : 0,
          borderColor: variant === 'outline' ? colors.border : undefined,
        },
        style,
      ]}
    >
      <Text style={{ fontSize: 12, fontWeight: '600', color: textMap[variant] }}>
        {children}
      </Text>
    </View>
  );
}

// ─── Separator ───────────────────────────────────────────

export function Separator({ style }: { style?: ViewStyle }) {
  const { colors } = useTheme();
  return <View style={[{ height: 1, backgroundColor: colors.border, marginVertical: 16 }, style]} />;
}

// ─── Switch ──────────────────────────────────────────────

interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Switch({ value, onValueChange, label, disabled }: SwitchProps) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      {label && (
        <Text style={{ fontSize: 15, color: colors.foreground, flex: 1, marginRight: 12 }}>
          {label}
        </Text>
      )}
      <RNSwitch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.input, true: colors.primary + '80' }}
        thumbColor={value ? colors.primary : colors.muted}
        ios_backgroundColor={colors.input}
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
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      {icon && <Text style={{ fontSize: 48, marginBottom: 16 }}>{icon}</Text>}
      <Text style={{ fontSize: 18, fontWeight: '600', color: colors.foreground, textAlign: 'center' }}>
        {title}
      </Text>
      {description && (
        <Text style={{ fontSize: 14, color: colors.mutedForeground, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
          {description}
        </Text>
      )}
      {action && <View style={{ marginTop: 20 }}>{action}</View>}
    </View>
  );
}

// ─── LoadingScreen ───────────────────────────────────────

export function LoadingScreen({ message }: { message?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.primary} />
      {message && (
        <Text style={{ fontSize: 14, color: colors.mutedForeground, marginTop: 12 }}>{message}</Text>
      )}
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
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bgColor,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      accessibilityLabel={`Avatar for ${name}`}
    >
      <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: size * 0.4 }}>{initials}</Text>
    </View>
  );
}

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const palette = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899'];
  return palette[Math.abs(hash) % palette.length];
}
