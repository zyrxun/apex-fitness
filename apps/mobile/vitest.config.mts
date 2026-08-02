import { defineConfig } from 'vitest/config';

// Node-only tests. Nothing under test imports react-native, so there is no
// jest-expo preset and no RN renderer to configure: the recording layer is
// deliberately plain TypeScript, which is most of the point of hiding the SDK
// behind an interface.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
