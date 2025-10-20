import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MobileApp() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.content}>
          <Text style={styles.title}>Welcome to EatPal</Text>
          <Text style={styles.subtitle}>Your AI-Powered Meal Planning Assistant</Text>
          <Text style={styles.description}>
            Mobile app is under construction. You'll soon be able to:
          </Text>
          <View style={styles.featureList}>
            <Text style={styles.feature}>📱 Track meals and nutrition</Text>
            <Text style={styles.feature}>👨‍👩‍👧 Manage kids' food preferences</Text>
            <Text style={styles.feature}>📅 Plan weekly meals</Text>
            <Text style={styles.feature}>🛒 Generate shopping lists</Text>
            <Text style={styles.feature}>🤖 Get AI meal recommendations</Text>
            <Text style={styles.feature}>📊 View nutrition analytics</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#10b981',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#6b7280',
    marginBottom: 24,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: '#374151',
    marginBottom: 16,
    textAlign: 'center',
  },
  featureList: {
    width: '100%',
    marginTop: 16,
  },
  feature: {
    fontSize: 16,
    color: '#374151',
    marginBottom: 12,
    paddingLeft: 8,
  },
});

