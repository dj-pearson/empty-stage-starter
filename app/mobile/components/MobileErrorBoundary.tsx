import { Component, type ErrorInfo, type ReactNode } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { captureMobileError, addBreadcrumb, sendUserFeedback } from '../lib/sentryMobile';
import { colors, spacing, fontSize, borderRadius } from '../lib/theme';

/**
 * US-134: Mobile error boundary + crash reporting.
 *
 * Wraps the mobile root layout. Catches JS render/effect errors thrown by
 * descendants, ships them to Sentry via captureMobileError(), and gives the
 * user a recovery path (Try again / Report a problem). Native crashes
 * (Java/Obj-C) need @sentry/react-native — see sentryMobile.ts header for the
 * follow-up hand-off plan.
 */

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  feedback: string;
  reported: boolean;
}

export class MobileErrorBoundary extends Component<Props, State> {
  state: State = { error: null, feedback: '', reported: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Add a breadcrumb so future errors carry the boundary lineage.
    addBreadcrumb({
      category: 'error-boundary',
      level: 'error',
      message: error.message,
      data: {
        platform: Platform.OS,
        componentStack: info.componentStack?.slice(0, 2000),
      },
    });

    captureMobileError(error, {
      tags: { boundary: 'mobile-root' },
      extra: { componentStack: info.componentStack ?? '' },
    });
  }

  reset = () => {
    this.setState({ error: null, feedback: '', reported: false });
  };

  submitFeedback = () => {
    const { feedback, error } = this.state;
    if (!feedback.trim()) {
      Alert.alert('Tell us a bit more', 'Please describe what you were doing when the error happened.');
      return;
    }
    sendUserFeedback({
      message: feedback.trim(),
      error,
      platform: Platform.OS,
    });
    this.setState({ feedback: '', reported: true });
  };

  render() {
    const { error, feedback, reported } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.icon}>⚠️</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            EatPal hit an unexpected error. We've reported it so it can get fixed.
          </Text>

          {/* Showing the message helps power users; we don't show the stack. */}
          {!!error.message && (
            <Text
              style={styles.errorMessage}
              numberOfLines={3}
              accessibilityLabel={`Error: ${error.message}`}
            >
              {error.message}
            </Text>
          )}

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={this.reset}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={styles.primaryButtonText}>Try again</Text>
          </TouchableOpacity>

          {!reported ? (
            <View style={styles.feedbackBlock}>
              <Text style={styles.feedbackLabel}>What were you trying to do?</Text>
              <TextInput
                style={styles.feedbackInput}
                multiline
                numberOfLines={4}
                placeholder="e.g. I tapped Add on the grocery list and the screen froze"
                placeholderTextColor={colors.textSecondary}
                value={feedback}
                onChangeText={(t) => this.setState({ feedback: t })}
                accessibilityLabel="Describe what happened"
              />
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={this.submitFeedback}
                accessibilityRole="button"
                accessibilityLabel="Send feedback"
              >
                <Text style={styles.secondaryButtonText}>Send feedback</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.reportedText}>Thanks — feedback sent.</Text>
          )}
        </ScrollView>
      </View>
    );
  }
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg, alignItems: 'center', paddingTop: spacing.xxl },
  icon: { fontSize: 56, marginBottom: spacing.md },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  message: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  errorMessage: {
    fontSize: fontSize.sm,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.lg,
    fontStyle: 'italic',
    paddingHorizontal: spacing.md,
  },
  primaryButton: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginBottom: spacing.md,
  },
  primaryButtonText: { color: colors.background, fontWeight: '700', fontSize: fontSize.md },
  feedbackBlock: { alignSelf: 'stretch', marginTop: spacing.md },
  feedbackLabel: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600', marginBottom: spacing.xs },
  feedbackInput: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    backgroundColor: colors.background,
    color: colors.text,
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
    textAlignVertical: 'top',
  },
  secondaryButton: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: { color: colors.primary, fontWeight: '600', fontSize: fontSize.md },
  reportedText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600', marginTop: spacing.md },
});
