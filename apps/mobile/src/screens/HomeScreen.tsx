/**
 * The proof screen for ADR 0001 build task 1.
 *
 * Everything domain-shaped on this screen comes from `@apex/shared`: the sport
 * taxonomy is the server's enum, the metadata is the server's metadata, and the
 * sample payload is validated by the *same zod schema instance* the API parses
 * request bodies with. If Metro cannot resolve the workspace package, or the
 * package's TypeScript will not compile inside the app, this screen is where it
 * shows up.
 */

import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  createActivityBodySchema,
  fromCanonicalMeters,
  SPORT_CATEGORIES,
  SPORT_TYPES,
  sportMeta,
  sportsInCategory,
  type SportCategory,
} from '@apex/shared';

import { theme } from '../theme';

/** A recording the app might be about to upload. Deliberately shaped by hand so
 *  the schema — not the mock recorder — is what is under test here. */
const SAMPLE_UPLOAD = {
  uploadId: '4f6b4f1e-8f9a-4a7b-9f2f-1c2d3e4f5a6b',
  sportType: 'TrailRun',
  name: 'Domain loop',
  startedAt: '2026-08-03T06:12:00+12:00',
  timezone: 'Pacific/Auckland',
  elapsedS: 1_845,
  movingS: 1_790,
  distanceM: 6_420,
  streams: {
    time: [0, 1, 2, 3],
    latlng: [
      [-36.8601, 174.7761],
      [-36.8602, 174.7763],
      [-36.8603, 174.7765],
      [-36.8604, 174.7767],
    ],
    heartrate: [131, 137, 142, 145],
  },
};

const CATEGORY_LABELS: Record<SportCategory, string> = {
  run: 'Run',
  ride: 'Ride',
  swim: 'Swim',
  strength: 'Strength',
  other: 'Other',
};

export function HomeScreen(): React.JSX.Element {
  // Runtime proof, not just a type import: the server's schema parses (or
  // rejects) a payload here, on the device, before it costs a round trip.
  const validation = useMemo(() => createActivityBodySchema.safeParse(SAMPLE_UPLOAD), []);
  const distance = useMemo(() => fromCanonicalMeters(SAMPLE_UPLOAD.distanceM, 'metric'), []);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>@apex/shared, live in the app</Text>
      <Text style={styles.subtitle}>
        {SPORT_TYPES.length} sport types and {SPORT_CATEGORIES.length} categories, imported from the
        workspace package the API validates against.
      </Text>

      <View style={[styles.card, validation.success ? styles.cardGood : styles.cardBad]}>
        <Text style={styles.cardLabel}>createActivityBodySchema.safeParse</Text>
        <Text style={styles.cardValue}>
          {validation.success ? 'valid' : `${validation.error.issues.length} issue(s)`}
        </Text>
        <Text style={styles.cardHint}>
          {validation.success
            ? `${SAMPLE_UPLOAD.name} · ${distance.value} ${distance.unit} · sportType "${validation.data.sportType}"`
            : validation.error.issues.map((issue) => issue.message).join('\n')}
        </Text>
      </View>

      {SPORT_CATEGORIES.map((category) => {
        const sports = sportsInCategory(category);
        return (
          <View key={category} style={styles.section}>
            <Text style={styles.sectionTitle}>
              {CATEGORY_LABELS[category]} <Text style={styles.count}>({sports.length})</Text>
            </Text>
            <View style={styles.chips}>
              {sports.map((sport) => {
                const meta = sportMeta(sport);
                return (
                  <View key={sport} style={styles.chip}>
                    <Text style={styles.chipText}>{sport}</Text>
                    {meta.hasGps ? <Text style={styles.chipBadge}>GPS</Text> : null}
                    {meta.hasPool ? <Text style={styles.chipBadge}>pool</Text> : null}
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 20, paddingBottom: 48, gap: 16 },
  title: { color: theme.text, fontSize: 24, fontWeight: '700' },
  subtitle: { color: theme.muted, fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderLeftWidth: 4,
    padding: 16,
    gap: 4,
  },
  cardGood: { borderLeftColor: theme.good },
  cardBad: { borderLeftColor: theme.bad },
  cardLabel: { color: theme.muted, fontSize: 12, letterSpacing: 0.4 },
  cardValue: { color: theme.text, fontSize: 20, fontWeight: '600' },
  cardHint: { color: theme.muted, fontSize: 13, lineHeight: 18 },
  section: { gap: 8 },
  sectionTitle: { color: theme.text, fontSize: 16, fontWeight: '600' },
  count: { color: theme.muted, fontWeight: '400' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: { color: theme.text, fontSize: 13 },
  chipBadge: { color: theme.accent, fontSize: 10, textTransform: 'uppercase' },
});
