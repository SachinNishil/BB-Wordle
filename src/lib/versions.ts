// Version history, newest first. Add an entry here with every release:
// the top entry becomes the app version shown in the app, and phones show
// "Updated to vX" with a link to these notes after they update themselves.
export interface Release {
  version: string;
  date: string; // YYYY-MM-DD
  changes: string[];
}

export const VERSIONS: Release[] = [
  {
    version: '1.1.0',
    date: '2026-10-07',
    changes: [
      'Ties are settled by time: fewer guesses still wins, but if you both solve in the same number of guesses, the faster solver takes it.',
      'Version history, from the button at the top right of the home screen.',
      'The app now updates itself a few moments after a new version goes live. No refreshing needed, and it never interrupts a game in progress.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-10-07',
    changes: [
      'Shared word repository with bulk import, duplicate and dictionary checks.',
      'Live two-phone games with a synced 3, 2, 1 countdown and your partner’s progress in colours only.',
      'Results, permanent history, stats, head to head and the Hall of fame.',
      'Profiles with photos, dark mode, and install to the home screen.',
    ],
  },
];

export const APP_VERSION = VERSIONS[0].version;
