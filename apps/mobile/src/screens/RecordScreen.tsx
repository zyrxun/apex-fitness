/**
 * A bare recording screen, driven entirely by the `ActivityRecorder` interface.
 *
 * Note what is *not* imported here: any geolocation SDK, any permission API,
 * any native module. Swapping `MockActivityRecorder` for the Transistorsoft
 * implementation (ADR 0001 build task 2) is a one-line change in this file and
 * nothing else in the app moves. That is the escape hatch from ADR §5, and it
 * only stays real if it is enforced from the first screen.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fromCanonicalMeters, type SportType } from '@apex/shared';

import type { ActivityRecorder, RecorderState, RecordingMetrics } from '../recording';
import { MockActivityRecorder, sessionToStreams } from '../recording';
import { formatDuration, theme } from '../theme';

const SPORT: SportType = 'TrailRun';

const EMPTY_METRICS: RecordingMetrics = {
  elapsedS: 0,
  movingS: 0,
  distanceM: 0,
  sampleCount: 0,
  currentSpeedMs: null,
};

const paceLabel = (speedMs: number | null): string => {
  if (speedMs === null || speedMs <= 0) return '--:--';
  const secPerKm = 1000 / speedMs;
  return `${formatDuration(secPerKm)} /km`;
};

export function RecordScreen(): React.JSX.Element {
  // One recorder for the life of the screen. The real one owns a native session
  // and must not be reconstructed on re-render.
  const recorderRef = useRef<ActivityRecorder | null>(null);
  if (recorderRef.current === null) {
    recorderRef.current = new MockActivityRecorder({ intervalMs: 1000, speedMs: 3.2 });
  }
  const recorder = recorderRef.current;

  const [state, setState] = useState<RecorderState>(recorder.getState());
  const [metrics, setMetrics] = useState<RecordingMetrics>(EMPTY_METRICS);
  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => {
    const offMetrics = recorder.onMetrics((next) => setMetrics({ ...next }));
    const offState = recorder.onStateChange((change) => setState(change.state));
    return () => {
      offMetrics();
      offState();
      recorder.destroy();
    };
  }, [recorder]);

  const onStart = useCallback(async () => {
    setSummary(null);
    setMetrics(EMPTY_METRICS);
    await recorder.start({ sportType: SPORT });
  }, [recorder]);

  const onStop = useCallback(async () => {
    const session = await recorder.stop();
    // The payoff: a finished session projects straight onto the server's
    // stream contract with no translation layer.
    const streams = sessionToStreams(session);
    setSummary(
      `${session.samples.length} samples · ${streams.time.length} time points · ` +
        `${streams.latlng?.length ?? 0} fixes · ${streams.heartrate?.length ?? 0} HR readings`,
    );
    setMetrics({ ...session.metrics });
  }, [recorder]);

  const distance = useMemo(() => fromCanonicalMeters(metrics.distanceM, 'metric'), [metrics]);
  const isLive = state === 'recording';
  const isPaused = state === 'paused';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>{SPORT}</Text>
      <Text style={styles.state}>{state}</Text>

      <View style={styles.tiles}>
        <Tile label="Elapsed" value={formatDuration(metrics.elapsedS)} />
        <Tile label={`Distance (${distance.unit})`} value={distance.value.toFixed(2)} />
        <Tile label="Moving" value={formatDuration(metrics.movingS)} />
        <Tile label="Pace" value={paceLabel(metrics.currentSpeedMs)} />
      </View>

      <View style={styles.buttons}>
        {state === 'idle' || state === 'stopped' || state === 'discarded' ? (
          <Button label="Start" tone="accent" onPress={onStart} />
        ) : null}
        {isLive ? <Button label="Pause" onPress={() => void recorder.pause()} /> : null}
        {isPaused ? <Button label="Resume" onPress={() => void recorder.resume()} /> : null}
        {isLive || isPaused ? <Button label="Stop" tone="bad" onPress={onStop} /> : null}
        {isPaused ? <Button label="Discard" onPress={() => void recorder.discard()} /> : null}
      </View>

      {summary ? <Text style={styles.summary}>{summary}</Text> : null}

      <Text style={styles.footnote}>
        Recording is a MockActivityRecorder replaying a hardcoded loop. The native core
        (react-native-background-geolocation) lands in ADR 0001 build task 2 behind this same
        interface.
      </Text>
    </ScrollView>
  );
}

function Tile({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue}>{value}</Text>
    </View>
  );
}

function Button({
  label,
  onPress,
  tone = 'neutral',
}: {
  label: string;
  onPress: () => void;
  tone?: 'neutral' | 'accent' | 'bad';
}): React.JSX.Element {
  const toneStyle =
    tone === 'accent' ? styles.buttonAccent : tone === 'bad' ? styles.buttonBad : undefined;
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.button, toneStyle, pressed && styles.buttonPressed]}
      onPress={onPress}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 20, gap: 16 },
  eyebrow: { color: theme.accent, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  state: { color: theme.text, fontSize: 28, fontWeight: '700' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  tileLabel: { color: theme.muted, fontSize: 12 },
  tileValue: { color: theme.text, fontSize: 26, fontWeight: '600', fontVariant: ['tabular-nums'] },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  button: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  buttonAccent: { backgroundColor: theme.accent, borderColor: theme.accent },
  buttonBad: { borderColor: theme.bad },
  buttonPressed: { opacity: 0.7 },
  buttonText: { color: theme.text, fontSize: 15, fontWeight: '600' },
  summary: { color: theme.good, fontSize: 13, lineHeight: 19 },
  footnote: { color: theme.muted, fontSize: 12, lineHeight: 18 },
});
