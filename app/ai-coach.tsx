import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from './providers/MobileThemeProvider';
import { useMobileApp } from './providers/MobileAppProvider';
import { Card, CardContent, EmptyState } from './components/ui';
import { supabase } from '@/integrations/supabase/client';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function AICoachScreen() {
  const { colors } = useTheme();
  const { kids, foods, activeKidId } = useMobileApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const activeKid = kids.find(k => k.id === activeKidId);
  const safeFoods = foods.filter(f => f.is_safe);

  const suggestions = [
    'Suggest dinner ideas for tonight',
    'How can I introduce new vegetables?',
    'Create a balanced meal plan for the week',
    'Help with picky eating strategies',
  ];

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: text.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const context = [
        activeKid ? `Planning for ${activeKid.name}${activeKid.age ? `, age ${activeKid.age}` : ''}.` : '',
        activeKid?.allergens?.length ? `Allergens: ${activeKid.allergens.join(', ')}.` : '',
        safeFoods.length > 0 ? `Known safe foods: ${safeFoods.slice(0, 10).map(f => f.name).join(', ')}.` : '',
      ].filter(Boolean).join(' ');

      const { data, error } = await supabase.functions.invoke('ai-meal-coach', {
        body: { message: text.trim(), context },
      });

      const reply = data?.reply || 'Sorry, I wasn\'t able to generate a response. Please try again.';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I\'m having trouble connecting. Please check your internet and try again.',
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: true, headerTitle: 'AI Meal Coach', headerTintColor: colors.primary, headerStyle: { backgroundColor: colors.background } }} />

      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={100}
      >
        <ScrollView
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
        >
          {messages.length === 0 ? (
            <View style={styles.welcomeContainer}>
              <Text style={styles.welcomeEmoji}>🤖</Text>
              <Text style={[styles.welcomeTitle, { color: colors.foreground }]}>AI Meal Coach</Text>
              <Text style={[styles.welcomeDesc, { color: colors.mutedForeground }]}>
                Ask me anything about meal planning, nutrition, or picky eating strategies.
              </Text>
              <View style={styles.suggestions}>
                {suggestions.map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.suggestionChip, { backgroundColor: colors.muted }]}
                    onPress={() => sendMessage(s)}
                  >
                    <Text style={[styles.suggestionText, { color: colors.foreground }]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            messages.map((msg, idx) => (
              <View
                key={idx}
                style={[
                  styles.messageBubble,
                  msg.role === 'user'
                    ? [styles.userBubble, { backgroundColor: colors.primary }]
                    : [styles.assistantBubble, { backgroundColor: colors.muted }],
                ]}
              >
                <Text style={[
                  styles.messageText,
                  { color: msg.role === 'user' ? colors.primaryForeground : colors.foreground },
                ]}>
                  {msg.content}
                </Text>
              </View>
            ))
          )}

          {isLoading && (
            <View style={[styles.messageBubble, styles.assistantBubble, { backgroundColor: colors.muted }]}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          )}
        </ScrollView>

        {/* Input Bar */}
        <View style={[styles.inputBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.muted, color: colors.foreground }]}
            placeholder="Ask about meals, nutrition..."
            placeholderTextColor={colors.mutedForeground}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => sendMessage(input)}
            returnKeyType="send"
            multiline
            maxLength={500}
            accessibilityLabel="Message input"
          />
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: input.trim() ? colors.primary : colors.muted }]}
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            accessibilityLabel="Send message"
          >
            <Text style={[styles.sendButtonText, { color: input.trim() ? colors.primaryForeground : colors.mutedForeground }]}>
              ↑
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  messages: { flex: 1 },
  messagesContent: { padding: 16, paddingBottom: 8 },
  welcomeContainer: { alignItems: 'center', paddingTop: 40 },
  welcomeEmoji: { fontSize: 48, marginBottom: 12 },
  welcomeTitle: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  welcomeDesc: { fontSize: 15, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  suggestions: { width: '100%', gap: 8 },
  suggestionChip: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10 },
  suggestionText: { fontSize: 14, fontWeight: '500' },
  messageBubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, marginBottom: 8, maxWidth: '85%' },
  userBubble: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  assistantBubble: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  messageText: { fontSize: 15, lineHeight: 22 },
  inputBar: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    alignItems: 'flex-end',
  },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 100 },
  sendButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sendButtonText: { fontSize: 18, fontWeight: '700' },
});
