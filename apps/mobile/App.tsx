import { useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { HomeScreen } from './src/screens/HomeScreen';
import { RecordScreen } from './src/screens/RecordScreen';
import { theme } from './src/theme';

const TABS = ['Shared', 'Record'] as const;
type Tab = (typeof TABS)[number];

// Deliberately no navigation library yet. Two screens do not justify a
// dependency, and the shell exists to prove the workspace import and the
// recorder interface, not to be the app's information architecture.
export default function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('Shared');

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.body}>{tab === 'Shared' ? <HomeScreen /> : <RecordScreen />}</View>
      <View style={styles.tabBar}>
        {TABS.map((name) => (
          <Pressable
            key={name}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === name }}
            style={[styles.tab, tab === name && styles.tabActive]}
            onPress={() => setTab(name)}
          >
            <Text style={[styles.tabText, tab === name && styles.tabTextActive]}>{name}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  body: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.surface,
  },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabActive: { borderTopWidth: 2, borderTopColor: theme.accent },
  tabText: { color: theme.muted, fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: theme.text },
});
