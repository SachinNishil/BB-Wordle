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
    version: '1.6.0',
    date: '2026-10-07',
    changes: [
      'A green dot on your partner\'s photo on the home screen whenever they have the app open.',
      'Say something: tap your own photo on the home screen and type a message. It shows as a speech bubble from your photo on your partner\'s home screen for a day.',
      'Settings › Classic words: choose what Classic can pick on top of everyday words: words ending in -ed, plurals, and uncommon or tricky words. Tick all three for the whole dictionary. It\'s shared, so both phones always play with the same setting.',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-10-07',
    changes: [
      'Spectator mode now shows your partner typing, letter by letter, before they even press Enter.',
      'Trash talk always gets through: it pops up on any screen (not just the game), arrives straight away over the live connection, and turns up within a few seconds even when an iPhone has quietly dropped that connection. Messages sent while the app was closed pop up when it opens.',
      'Classic now picks from about 2,000 everyday words. Obscure and brand-new words still count as guesses, they just never come up as the answer.',
      'Removed the "Away" and "Live" labels, which were sometimes wrong. Once a round starts, the other player simply shows as Playing.',
      'On the waiting screen only the heart beats now; your photos stay still.',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-10-07',
    changes: [
      'Spectator mode: once your round is over, watch your partner play live, letters and all. Flip back to your own board any time.',
      'Trash talk: while you watch, send emojis, quick lines or anything you type (up to 60 characters). It pops up on their screen mid-game. They can reply once they finish, and the banter carries on under the results.',
      'Share as image: one picture with both full boards, the answer, who won, guesses and times. It sits next to Show guesses and Share as text on the results.',
      'Ruled-out letters on the keyboard are now dark grey instead of red: clearly out, easier on the eyes.',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-10-07',
    changes: [
      'A fresh start: all the test games are cleared, so scores, history and stats begin from zero with game #1.',
      'No more word repository. Classic now picks a random word from the whole dictionary (over 12,000 words) and never repeats one until every word has been played.',
      'Want to choose the words yourselves? That is what Challenge mode is for.',
      'Letters ruled out on the keyboard now turn red, so they are impossible to miss.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-10-07',
    changes: [
      'No more invite links or rooms. Open the app, pick who you are once, and START GAME is right there.',
      'New Challenge mode: you pick a word for your partner and your partner picks one for you. When both words are in, you each tap Ready and the countdown starts.',
      'The classic mode still picks a random word from your repository, the same word for both of you.',
      'Results and history show both words for a challenge, with who picked each one. Stats show your record in each mode, plus a new Toughest Challenger award.',
    ],
  },
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
