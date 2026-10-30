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
    version: '1.22.0',
    date: '2026-10-30',
    changes: [
      'Sabotage: powers now cost coins and you get 🪙 8 for your three. Colour blind and Bounce back cost 5, Steal a row and Liar tile 4, Shield, Banned letter, Speed trap, Delayed reveal and Forced first 3, Fog, Mirror, Shuffle, Keyboard amnesia, Lights out and Freeze 2, the rest 1. Three at random stays within 8 too.',
      'Sabotage: finished first? Any powers you haven\'t used still work while you watch.',
      'Secret chat: mid-round you still can\'t start a chat, but when your partner (watching) sends you a message, tap the pop-up at the top and reply right there.',
    ],
  },
  {
    version: '1.21.0',
    date: '2026-10-28',
    changes: [
      'New mode: Sabotage 😈. Classic rules (same word, six guesses), plus three powers each to throw at the other one. Pick them in the waiting room: three at random, or any three you like.',
      'Eighteen powers: Fog, Earthquake, Lights out, Mirror, Banned letter, Shuffle, Sticky key, Ghost letter, Colour blind, Liar tile, Delayed reveal, Keyboard amnesia, Freeze, Speed trap, Steal a row, Forced first, and for defence Shield and Bounce back.',
      'Each power works once, there is one every 30 seconds at most, and only one sabotage can be on someone at a time. You see what hit you and who sent it; they see an emoji on your mini board while it lasts.',
      'Sabotage has its own tab in Stats and its own tile on Home, next to Endless.',
    ],
  },
  {
    version: '1.20.1',
    date: '2026-10-28',
    changes: [
      'The chat after a game looks the way it used to again (trash talk is now just "Chat"). Tap the box and the last few messages, the emojis and the box pop up right above the keyboard; when the keyboard goes down, it\'s back to the usual screen with your draft still in the box.',
      'A slimmer Classic tile on Home.',
      'Stats and History always open at the top.',
    ],
  },
  {
    version: '1.20.0',
    date: '2026-10-28',
    changes: [
      'New Home: a big Classic tile, Challenge and Endless side by side, Solo tucked below. No captions.',
      'The waiting room is back, for all three modes: starting a game takes you into it, and being in it means you\'re ready. On Home, the waiting game\'s tile shows the photo of whoever is in the room, so the other one knows which to tap. The 3, 2, 1 starts once you\'re both in.',
      'Challenge: you pick each other\'s words right there in the waiting room once you\'re both in, and the round starts as soon as both words are in.',
      'Typing a message (spectating, watching solo or after a game): the chat pops up right on top of the phone keyboard, with the whole conversation in view, and the keyboard stays up after you send.',
      'Your partner\'s messages and status updates pop up wherever you are, Home included, even after you\'ve left the game. Tap a message to reply right there.',
      'Settings › Keyboard size: make the Wordle keyboard smaller or bigger, with a preview of how the board adjusts.',
    ],
  },
  {
    version: '1.19.0',
    date: '2026-10-18',
    changes: [
      'New Endless race: no limit on guesses, whoever finds the word first wins. Rows keep coming and older ones slide up (scroll back to see them). It has its own tab in Stats.',
      'No more waiting room: start or join a game and you wait right on Home ("You\'re here"). The 3, 2, 1 starts the moment you\'re both in the app.',
      'An invite nobody joins within 10 minutes is called off on its own.',
      'Your clock now stops while you\'re away from a round (app minimised or back on Home) and carries on when you come back. Your partner\'s clock shows top right next to their board, with ⏸ while they\'re away.',
      'The game that ran for a whole day in the background no longer counts its time in your averages (its result stays).',
      'The phone keyboard now slides over the app instead of squashing it, and the box you\'re typing in sits just above it.',
      'The status box opens near the top, empty, with no suggestions, so the keyboard never covers it.',
      'In dark mode the bottom gesture bar is dark too (it may take a day, or a reinstall, for Android to pick this up).',
    ],
  },
  {
    version: '1.18.0',
    date: '2026-10-16',
    changes: [
      'A battle now only starts when you\'re both in the app at the same time. If one of you starts it and leaves, it waits (no more one person playing alone while the other isn\'t there).',
      'The waiting screen shows who is here right now, and Home says so too. As soon as you\'re both in, the 3, 2, 1 starts and Home jumps straight to the game.',
      '"Play now, join later" is gone, since games no longer start with only one of you.',
    ],
  },
  {
    version: '1.17.0',
    date: '2026-10-15',
    changes: [
      'Telegram invites: connect in Settings and a Telegram bot messages you whenever your partner starts a game or challenges you, with a button that opens BB Wordle. Just that one message, nothing else.',
      'When the last guess of a game is played, the row now flips all the way (and bounces if it\'s right) before the results appear. Same for whoever is watching.',
    ],
  },
  {
    version: '1.16.0',
    date: '2026-10-14',
    changes: [
      'Badges tidied up. The separate Badges section in Stats and the milestone pop-ups are gone: they mostly repeated the Stats table (streaks, games played).',
      'Each round still shows a chip for the rare stuff: Wordle in 1, Wordle in 2, Sea of Greens, Hard Mode and Out of the Dark.',
      'Hall of fame: new Sea of Greens, Hard Mode Hero and Out of the Dark awards (who has the most), plus two insights about the two of you: Daily Devotion (longest run of days with a battle) and Busiest Day.',
      'Hall of fame: dropped Speed Demon, Unstoppable, Last Gasp, Solo Grinder and Solo Speedrun, which repeated the Stats table or another award.',
    ],
  },
  {
    version: '1.15.0',
    date: '2026-10-13',
    changes: [
      'Badges, like the ones in the NYT Wordle app. Every round can earn: Wordle in 1, Wordle in 2, Sea of Greens (no yellow tiles at all), Hard Mode (every hint reused), Golden Start (3+ greens first guess), Out of the Dark (solved after two all-grey guesses), Lightning (under 30 seconds) and Phew! (solved on guess 6).',
      'Milestones, earned once each: day streaks (3 up to 365 days in a row), solved in a row (5 to 100), battle wins in a row (3 to 20) and games played (10 to 1000). Battles and solo games both count.',
      'You see what you earned right after each round, on the results and in History. All badges and your progress are at the bottom of Stats, with a toggle for each of you. A notice pops up when you reach a new milestone.',
    ],
  },
  {
    version: '1.14.1',
    date: '2026-10-13',
    changes: [
      'Posting your status on Android no longer leaves the page at the bottom either, even when the keyboard takes a moment to close.',
    ],
  },
  {
    version: '1.14.0',
    date: '2026-10-13',
    changes: [
      'Emojis that pop up over the board and from the soundboard now show in full. They used to get cut off at the edges or hidden behind the top bar.',
      'Several emojis at once now line up side by side instead of stacking down the screen.',
      'Posting or editing your status on Home no longer leaves the page scrolled to the bottom.',
    ],
  },
  {
    version: '1.13.0',
    date: '2026-10-12',
    changes: [
      'Spectating: the answer is face down (? tiles) until you tap it, so you can try to solve it in your head while you watch. Tap again to hide it. Watching a solo game works the same way until it\'s over.',
      'Tapping an emoji or a quick line no longer brings up the phone keyboard. It only opens when you tap the message box, and stays up while you send typed messages.',
    ],
  },
  {
    version: '1.12.0',
    date: '2026-10-12',
    changes: [
      'Messages: after you send one, the keyboard and cursor stay put so you can keep typing. Tapping an emoji or a quick line doesn\'t close the keyboard either.',
      'Stats: one table with a Classic / Challenge / Solo toggle at the top, instead of separate tables. The guess distribution below follows the same toggle.',
      'Hall of fame has more awards: Sharpshooter, Fastest Solve Ever, Unstoppable, Photo Finish, Last Gasp, Best Opener, each of your go-to openers, Night Owl, White Flag, Solo Grinder and Solo Speedrun. Each one appears once there\'s something to show.',
    ],
  },
  {
    version: '1.11.0',
    date: '2026-10-11',
    changes: [
      'Solo: going back (or leaving the app) now pauses the clock. Come back and it carries on from where it stopped. Time away never counts.',
      'When your partner is watching your game (battle or solo), an 👀 with their name stays in the top bar, after a one-time "is watching you" notice.',
      'Stats: streaks now count battles won in a row ("Current win streak", "Longest win streak"). They used to count rounds solved, so someone who lost every battle could still show a long streak.',
      'Home: your two photos stay level when "Last seen" shows under your partner.',
      'The WORDLE title now rolls its letters one by one every few seconds, like a slot machine landing on the same letter.',
    ],
  },
  {
    version: '1.10.0',
    date: '2026-10-10',
    changes: [
      'Solo now has the same 3, 2, 1 and a clock at the top, like a battle. There\'s a give up flag too.',
      'Solo games get their own table at the bottom of Stats (games, solve rate, guesses, times, streak). They\'re kept apart: nothing in it is added to the battle numbers.',
      'Watch your partner play solo: when they\'re on a solo game, Home shows it with a Watch button. You see their board, what they\'re typing, their clock and the word, with the same emojis and messages as spectating.',
      'While someone is watching your solo game, the soundboard appears above your board so you can boom back.',
      'When your partner isn\'t in the app, Home shows when they were last seen under their photo.',
    ],
  },
  {
    version: '1.9.0',
    date: '2026-10-10',
    changes: [
      'While you\'re both still playing, the box above the board is now an emoji soundboard: tap away as often as you like. Each one bursts over your partner\'s board and makes their screen jump (and buzz, on phones that allow it).',
      'Messages are back to spectator mode: once you\'ve finished, type messages or send emojis from the bar at the bottom, and they pop up at the top of your partner\'s screen.',
      'While spectating, your partner\'s clock ticks live at the top, next to "Watching".',
      'Your speech bubble on the home screen can now be edited: tap the bubble (or your photo), change it and press Update.',
    ],
  },
  {
    version: '1.8.1',
    date: '2026-10-10',
    changes: [
      'Chat now uses the game\'s own keyboard: tap the chat box and type straight away, with SEND, space, ? and !. No phone keyboard popping up over the game.',
      'The chat takes the board\'s place while it\'s open, so the newest messages are always in view on any phone size. Done brings the board back.',
      'Chat works the whole game, not only after you finish (needs the latest schema.sql in Supabase).',
    ],
  },
  {
    version: '1.8.0',
    date: '2026-10-10',
    changes: [
      'Solo: plain Wordle on your own, just for fun. It\'s the small "Or play solo" link under the game card on the home screen. No score, no stats, nothing shared with your partner.',
    ],
  },
  {
    version: '1.7.0',
    date: '2026-10-10',
    changes: [
      'Experiment: the small card at the top left of the board is now a chat box. Tap it to chat with your partner any time during a game, not just after you finish.',
      'Text messages show only in the chat box (no pop-ups over the board). Emoji-only messages still burst over the board.',
      'Your partner\'s side is now just their name over their mini board, so the chat box gets most of the width. Your own time moved up next to the game number.',
      'Tapping the chat box slides the chat down from the top (about half the screen) with your recent messages, emojis and a box to type in.',
    ],
  },
  {
    version: '1.6.1',
    date: '2026-10-08',
    changes: [
      'The small score card at the top now waits for the board: a new row of colours (and the guess count) appears there only once the tiles have finished flipping. Same for your partner\'s card while you spectate.',
      'Fixed: trash talk was invisible on iPhones with Reduce Motion switched on (Settings › Accessibility › Motion). The messages arrived but faded out instantly. They now stay on screen either way.',
      'Trash talk now shows "Seen by Menaka" (or Sachin) under your message once it has popped up on their screen, so you know it landed.',
      'Fixed: two speech bubbles on the home screen no longer overlap. Each sits above its own photo.',
      'Trash talk pop-ups stay at the top: at most two at a time, and never lower than the first row of the board.',
      'Live typing while spectating is more reliable: the letters are also saved to the server, so you still see them within a couple of seconds when a phone\'s live connection has dropped.',
      'Rematch button at the bottom of the results. If your partner starts the next game first, it turns into Join rematch (no more pop-up notice there).',
    ],
  },
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
