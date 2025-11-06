/**
 * Home Screen - Pure JavaScript
 * Main screen for EatPal mobile app
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.content}>
          <Text style={styles.title}>Welcome to EatPal</Text>
          <Text style={styles.subtitle}>Your AI-Powered Meal Planning Assistant</Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Features:</Text>
            <View style={styles.featureList}>
              <FeatureItem emoji="📱" text="Track meals and nutrition" />
              <FeatureItem emoji="👨‍👩‍👧" text="Manage kids' food preferences" />
              <FeatureItem emoji="📅" text="Plan weekly meals" />
              <FeatureItem emoji="🛒" text="Generate shopping lists" />
              <FeatureItem emoji="🤖" text="Get AI meal recommendations" />
              <FeatureItem emoji="📊" text="View nutrition analytics" />
            </View>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Native JavaScript Build</Text>
            <Text style={styles.infoText}>
              This is a pure JavaScript build of EatPal, built with React Native CLI
              for maximum compatibility and stability on iOS and Android.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FeatureItem({ emoji, text }) {
  return (
    <View style={styles.featureItem}>
      <Text style={styles.featureEmoji}>{emoji}</Text>
      <Text style={styles.featureText}>{text}</Text>
    </View>
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
    marginBottom: 32,
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 16,
  },
  featureList: {
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    marginBottom: 8,
  },
  featureEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  featureText: {
    fontSize: 16,
    color: '#374151',
    flex: 1,
  },
  infoBox: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#10b981',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#10b981',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
});
