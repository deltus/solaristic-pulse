// Brain breaks (v3, rewritten after Azeem's round 5 feedback). docs/brain-breaks.md lists the same
// breaks for reading and vetting; a test keeps the two in step. Subject breaks have numbered steps,
// with "Say:" lines to read aloud, and any website as a tap-to-open link. "Any subject" breaks are
// what a class whose subject has none of its own gets. To add more subjects later (English, Maths,
// Science), add a group to BREAK_GROUPS and entries with that group; nothing else needs to change.

export type BreakType = 'calm' | 'perk';

export interface BrainBreak {
  id: string;
  name: string;
  /** A group id from BREAK_GROUPS (or a custom subject's id). */
  group: string;
  type: BreakType;
  /** e.g. "7–10"; "Any" for every year level. */
  years: string;
  minutes: string;
  position?: string;
  noise?: string;
  link?: string;
  /** What the link opens, shown on its button ("Open Globle"). */
  linkLabel?: string;
  /** Text that came with the link, e.g. which quiz to pick. */
  linkNote?: string;
  /** "What it is". */
  about?: string;
  /** What to have ready. Empty = nothing needed. */
  resources: string[];
  /** Optional extras when nothing is strictly needed, e.g. "N, S, E, W signs on the walls". */
  resourcesOptional?: string;
  steps: string[];
  /** Steps are the same as another break's (shown under this break's own line). */
  stepsFrom?: string;
  seatedVersion?: string;
  notes?: string;
  /** Added by the teacher in Settings → Brain breaks. */
  custom?: boolean;
}

/** Breaks for any class, and the fallback when a class's subject has none of its own. */
export const GENERAL_GROUP = 'general';

export const BREAK_GROUPS: { id: string; label: string }[] = [
  { id: 'geography', label: 'Geography' },
  { id: 'history', label: 'History' },
  { id: 'economics-business', label: 'Economics and Business' },
  { id: 'civics', label: 'Civics and Citizenship' },
  { id: GENERAL_GROUP, label: 'Any subject' },
  { id: 'calm', label: 'Calm' }
];

/** Class subject words that point to a group (lower case). */
export const SUBJECT_WORDS: Record<string, string[]> = {
  geography: ['geography', 'geo'],
  history: ['history'],
  'economics-business': ['economics', 'business', 'economics and business', 'commerce', 'eco', 'ecobus'],
  civics: ['civics', 'citizenship', 'civics and citizenship']
};

/** Shown on every calm break. */
export const CALM_RULE = 'Joining in is invited, never forced. Eyes closed is optional. No touching.';

const PROJECTOR = ['projector and internet (open the link before you start)'];

export const BRAIN_BREAKS: BrainBreak[] = [
  // ---------- Geography ----------
  {
    id: 'globle', name: 'Globle', group: 'geography', type: 'perk', years: '7–10', minutes: '3–5',
    link: 'https://globle-game.com/', linkLabel: 'Globle',
    about: 'a mystery country on a globe with no borders. Each guess turns countries redder the closer they are.',
    resources: PROJECTOR,
    steps: [
      'Open Globle on the projector.',
      'Say: "There\'s a mystery country somewhere on this globe. Hands up to guess a country, and I\'ll type it in."',
      'After each guess, point at the colour. Say: "Redder means closer. Which way should we go next, and why?"',
      'Keep going until you find it, or stop at 5 minutes.',
      'Say: "Which clue helped us most?"'
    ]
  },
  {
    id: 'worldle', name: 'Worldle', group: 'geography', type: 'perk', years: '7–12', minutes: '3',
    link: 'https://worldle.teuteuf.fr/', linkLabel: 'Worldle',
    about: "guess the country from its outline. Each wrong guess shows how far away and which direction the answer is.",
    resources: PROJECTOR,
    steps: [
      'Open Worldle on the projector.',
      'Say: "Here\'s a country\'s shape. Talk to the person next to you for 20 seconds: which country is it?"',
      'Take a guess from one pair and type it in.',
      'Say: "It says 2,000 km to the north-east. So which country should we try next?"',
      'Keep going until you get it (6 guesses at most).'
    ]
  },
  {
    id: 'mystery-street', name: 'Mystery street', group: 'geography', type: 'perk', years: '7–12', minutes: '4–5',
    link: 'https://www.mapcrunch.com/', linkLabel: 'MapCrunch',
    about: 'a random Street View somewhere in the world. Students use clues to work out the country.',
    resources: PROJECTOR,
    steps: [
      'Open MapCrunch and tick "Stealth" in its options, so the place name stays hidden.',
      'Say: "We\'ve been dropped somewhere in the world. Look for clues: which side of the road cars drive on, the language on signs, the plants, the weather."',
      'Take three clues from the class and write them on the board.',
      'Say: "Hands up for each continent… now, which country?"',
      'Untick "Stealth" to reveal where it is.'
    ]
  },
  {
    id: 'seterra', name: 'Map quiz race', group: 'geography', type: 'perk', years: '7–9', minutes: '3',
    link: 'https://www.geoguessr.com/seterra', linkLabel: 'Seterra',
    linkNote: 'Pick Oceania, then a quiz such as Australia\'s states and territories or capital cities.',
    about: 'click each place on the map as fast as possible. The class calls out where to click.',
    resources: PROJECTOR,
    steps: [
      'Open Seterra and pick a quiz that fits your unit.',
      'Say: "It\'s the class against the clock. Call out where I should click. Wrong clicks cost us time."',
      'Play once, and write the time on the board.',
      'Say: "Next lesson, we try to beat it."'
    ]
  },
  {
    id: 'room-map', name: 'Room map', group: 'geography', type: 'perk', years: '7–10', minutes: '3', position: 'moving',
    about: 'the classroom becomes a map, and students walk to where a place would be.',
    resources: [], resourcesOptional: 'N, S, E, W signs on the walls',
    steps: [
      'Say: "The front wall is north. The middle of the room is Melbourne."',
      'Say: "Walk to where Sydney would be… now Perth… now Darwin… now Hobart." Change the places to fit your unit.',
      'Ask 1–2 students to explain why they stood there.',
      'Say: "Back to your seats in 10, 9, 8…"'
    ],
    seatedVersion: 'students point instead of walking.'
  },
  {
    id: 'country-chain', name: 'Country chain', group: 'geography', type: 'perk', years: '7–12', minutes: '2–3',
    about: 'each student names a country starting with the last letter of the one before.',
    resources: [],
    steps: [
      'Say: "I\'ll start: Australia. The next person needs a country starting with A. No repeats, 5 seconds each."',
      'Go around the room in seat order.',
      'If someone gets stuck, the class can help them out.',
      'Stop when you get back to the start, or at 3 minutes.'
    ]
  },

  // ---------- History ----------
  {
    id: 'timeguessr', name: 'TimeGuessr', group: 'history', type: 'perk', years: '8–12', minutes: '4–5',
    link: 'https://timeguessr.com/', linkLabel: 'TimeGuessr',
    about: 'a real historical photo. Guess the year and where it was taken.',
    resources: PROJECTOR,
    steps: [
      'Open TimeGuessr and start a game.',
      'Say: "Look closely at this photo. What clues tell us when this was? Look at clothes, cars, technology and buildings."',
      'Take 3–4 clues from students.',
      'Agree on a class guess for the year and the place, then enter it.',
      'Reveal the answer. Say: "Which clue was most useful?"'
    ]
  },
  {
    id: 'chronophoto', name: 'Chronophoto', group: 'history', type: 'perk', years: '7–12', minutes: '3',
    link: 'https://www.chronophoto.app/', linkLabel: 'Chronophoto',
    about: 'guess the year a photo was taken by sliding a timeline.',
    resources: PROJECTOR,
    steps: [
      'Open Chronophoto and start a game.',
      'Say: "Stand up if you think this photo is from before 1950. Stay seated if you think it\'s after."',
      'Say: "Now, which decade?" Take a few answers and move the slider to the class\'s choice.',
      'Reveal, then play the next photo.'
    ]
  },
  {
    id: 'wikitrivia', name: 'Before or after?', group: 'history', type: 'perk', years: '8–12', minutes: '3–5',
    link: 'https://wikitrivia.tomjwatson.com/', linkLabel: 'Wikitrivia',
    about: 'place historical events in order on a timeline. The class has three lives.',
    resources: PROJECTOR,
    steps: [
      'Open Wikitrivia and start a game.',
      'Read out the new event. Say: "Before or after? Hands up for before, hands down for after."',
      'Place the card where most of the class votes.',
      'Keep going until you lose three lives. Say: "Our score to beat next time is…"'
    ]
  },
  {
    id: 'human-timeline', name: 'Human timeline', group: 'history', type: 'perk', years: '7–10', minutes: '3–4', position: 'moving',
    about: 'students hold event cards and line up in the right order without talking.',
    resources: ['8–12 cards or sticky notes, each with an event from your unit (write them before class)'],
    steps: [
      'Hand out the cards to 8–12 students.',
      'Say: "Without talking, line up across the front in the order these happened."',
      'Say: "Everyone else: is the line right? Who should swap?"',
      'Reveal the correct order and ask one student why their event sits where it does.'
    ]
  },
  {
    id: 'who-am-i', name: 'Who am I?', group: 'history', type: 'perk', years: '7–12', minutes: '3',
    about: '20 yes/no questions to guess a historical figure from your unit.',
    resources: ['a person from your unit, written down where students can\'t see it'],
    steps: [
      'Say: "I\'m thinking of someone from our unit. You have 20 yes or no questions to work out who."',
      'Take questions with hands up, and keep a tally on the board.',
      'If they\'re stuck at 15, give one clue.',
      'Reveal, and ask: "Which question helped most?"'
    ]
  },
  {
    id: 'fact-or-fiction', name: 'Fact or fiction?', group: 'history', type: 'perk', years: '7–12', minutes: '3',
    about: 'surprising statements from the past. Students stand for fact and sit for fiction.',
    resources: ['5 surprising statements from your unit, some true and some made up'],
    steps: [
      'Say: "I\'ll read a statement about the past. Stand up if it\'s fact, stay sitting if it\'s fiction."',
      'Read the first statement, wait 5 seconds, then reveal.',
      'Ask one student who got it right: "What made you sure?"',
      'Do all 5.'
    ],
    seatedVersion: 'thumbs up for fact, thumbs down for fiction.'
  },

  // ---------- Economics and Business ----------
  {
    id: 'then-and-now', name: 'Then and now prices', group: 'economics-business', type: 'perk', years: '8–12', minutes: '3–4',
    link: 'https://www.rba.gov.au/calculator/', linkLabel: 'the RBA inflation calculator',
    about: "guess what an old price would be in today's money.",
    resources: [...PROJECTOR, '2–3 old prices, e.g. a loaf of bread in 1970 or a movie ticket in 1985'],
    steps: [
      'Open the RBA calculator.',
      'Say: "In 1970, a loaf of bread cost 20 cents. What would that be in today\'s money? Write down your guess."',
      'Enter it in the calculator and reveal. The closest guess wins.',
      'Say: "Why is it so different? What do we call prices going up over time?"'
    ]
  },
  {
    id: 'dollar-street', name: 'Dollar Street', group: 'economics-business', type: 'perk', years: '7–12', minutes: '4–5',
    link: 'https://www.gapminder.org/dollar-street', linkLabel: 'Dollar Street',
    about: "photos of real families' homes around the world, sorted by monthly income.",
    resources: PROJECTOR,
    steps: [
      'Open Dollar Street and pick a family, without showing their income.',
      'Say: "Here\'s this family\'s kitchen. Guess how much they earn a month. Low, middle or high?"',
      'Take votes with hands up, then reveal their income.',
      'Say: "What in the photo gave it away?"',
      'If there\'s time, compare the same room in a family on a very different income.'
    ]
  },
  {
    id: 'higher-or-lower', name: 'Higher or Lower', group: 'economics-business', type: 'perk', years: '7–12', minutes: '3',
    link: 'https://www.higherlowergame.com/', linkLabel: 'Higher or Lower',
    about: 'which gets more Google searches? A way into talking about demand and trends.',
    resources: PROJECTOR,
    notes: 'Check the topics before class, as some can be off-topic.',
    steps: [
      'Open Higher or Lower.',
      'Say: "Does this get more searches or fewer? Stand up for higher, stay sitting for lower."',
      'Go with the majority, and keep the streak going as a class.',
      'Say: "Why do you think people search for that so much?"'
    ]
  },
  {
    id: 'price-guess', name: 'Guess the price', group: 'economics-business', type: 'perk', years: '7–10', minutes: '3',
    about: 'guess the price of everyday items. Closest without going over wins.',
    resources: ['3 everyday items with their current price (a supermarket website is fine)', 'scrap paper or mini whiteboards'],
    steps: [
      'Say: "Write down your guess for what this costs. Closest without going over wins."',
      'Hold up or show the first item, and give 10 seconds.',
      'Reveal the price. Hands up if you were within a dollar.',
      'Do all 3, then ask: "Why might the same thing cost more in one shop than another?"'
    ]
  },
  {
    id: 'logo-from-memory', name: 'Logo from memory', group: 'economics-business', type: 'perk', years: '7–12', minutes: '3',
    about: 'draw a famous brand logo from memory in 30 seconds, then compare with the real one.',
    resources: ['scrap paper and a pen each', 'the real logo ready to show on screen'],
    steps: [
      'Say: "You have 30 seconds to draw the Woolworths logo from memory. Go!" Use any brand everyone knows.',
      'Show the real logo on screen. Hold up a few drawings.',
      'Say: "Why do brands spend so much on something you only half remember?"'
    ]
  },
  {
    id: 'sixty-second-pitch', name: '60-second pitch', group: 'economics-business', type: 'perk', years: '9–12', minutes: '4–5',
    about: 'pairs turn an everyday object into a product and pitch it.',
    resources: [], resourcesOptional: 'any object in the room',
    steps: [
      'Hold up an object.',
      'Say: "You have 60 seconds with your partner to turn this into a product. Give it a name, a price, and say who would buy it."',
      'Choose two pairs to pitch.',
      'Say: "Thumbs up for the one you\'d invest in."'
    ]
  },

  // ---------- Civics and Citizenship ----------
  {
    id: 'federal-state-local', name: 'Federal, state or local?', group: 'civics', type: 'perk', years: '7–9', minutes: '3',
    about: 'the class sorts services to the level of government that runs them.',
    resources: [],
    steps: [
      'Say: "I\'ll name something the government does. Show 1 finger for federal, 2 for state, 3 for local council."',
      'Read one at a time: passports, schools, rubbish bins, hospitals, the army, libraries, police, the money in your pocket.',
      'After each one, reveal the answer. (Passports, army and money: federal. Schools, hospitals and police: state. Bins and libraries: local.)',
      'Finish with: "Roads." Say: "Trick question! All three look after different roads."'
    ]
  },
  {
    id: 'double-majority', name: 'Double majority vote', group: 'civics', type: 'perk', years: '8–10', minutes: '4–5',
    about: 'a mock referendum. To pass, it needs most votes overall and a majority in 4 of the 6 "states".',
    resources: [],
    steps: [
      'Say: "Each table group is now a state." Make 6 groups.',
      'Say: "Here\'s our referendum: should homework be banned on Fridays? Hands up for yes."',
      'Count yes and no for each table, and write them on the board.',
      'Say: "To change the Constitution, we need most people across the country AND most people in at least 4 states. Did it pass?"',
      'Ask: "Why do you think Australia makes it this hard?"'
    ]
  },
  {
    id: 'agree-disagree-line', name: 'Agree / disagree line', group: 'civics', type: 'perk', years: '7–12', minutes: '3', position: 'moving',
    about: 'students stand along a line from "strongly agree" to "strongly disagree".',
    resources: ['a statement linked to your unit (e.g. "The voting age should be 16")'],
    steps: [
      'Say: "The left wall is strongly agree. The right wall is strongly disagree. Stand where you are."',
      'Read your statement.',
      'Ask one student from each end for their reason.',
      'Say: "If you\'ve changed your mind, move now." Ask one person who moved why.'
    ],
    seatedVersion: 'show 1–5 fingers.'
  },
  {
    id: 'rights-or-responsibilities', name: 'Right or responsibility?', group: 'civics', type: 'perk', years: '7–10', minutes: '3',
    about: 'quick sorting of things citizens can do or must do.',
    resources: [],
    steps: [
      'Say: "Hands up if it\'s a right. Hands on your head if it\'s a responsibility."',
      'Read one at a time: free speech, jury duty, voting, paying tax, a fair trial, obeying the law.',
      'After each one, ask one student to explain.',
      'Finish with: "Voting." Say: "In Australia it\'s both. Why?"'
    ]
  },
  {
    id: 'mini-parliament', name: 'Mini parliament', group: 'civics', type: 'perk', years: '8–12', minutes: '5',
    about: 'the class debates and votes on a quick classroom "bill".',
    resources: [],
    steps: [
      'Say: "Here\'s a bill: from next week, the last 5 minutes of Friday lessons are free time."',
      'Ask for one speaker for and one against. They get 30 seconds each.',
      'Say: "All those in favour, say aye… all those against, say no." Count hands if it\'s close.',
      'Say: "The ayes have it" or "The noes have it." (Remind them it\'s just for practice.)'
    ]
  },

  // ---------- Any subject ----------
  {
    id: 'count-to-twenty', name: 'Count to 20', group: GENERAL_GROUP, type: 'perk', years: 'Any', minutes: '2–3', noise: 'quiet',
    about: 'the class counts to 20, one person at a time, with no plan. If two speak at once, start again.',
    resources: [],
    steps: [
      'Say: "Close your eyes or look at your desk. We\'re going to count to 20 as a class, one voice at a time."',
      'Say: "No order, no signals. If two people say a number at the same time, we start again from 1."',
      'Say: "One." Then wait.',
      'Stop when you reach 20, or at 3 minutes. Say: "Our best was…"'
    ]
  },
  {
    id: 'quick-draw', name: 'Quick, Draw!', group: GENERAL_GROUP, type: 'perk', years: 'Any', minutes: '3',
    link: 'https://quickdraw.withgoogle.com/', linkLabel: 'Quick, Draw!',
    about: 'a student draws on screen and a computer tries to guess the drawing in 20 seconds.',
    resources: PROJECTOR,
    steps: [
      'Open Quick, Draw! and press "Let\'s draw!".',
      'Choose a student to draw with the mouse or on the board screen.',
      'Say: "Can the class guess it faster than the computer? Call out!"',
      'Swap drawers after each round. Play 3–4 rounds.'
    ]
  },
  {
    id: 'true-false-stand', name: 'Stand up if it\'s true', group: GENERAL_GROUP, type: 'perk', years: 'Any', minutes: '2–3', position: 'moving',
    about: 'quick true/false statements about today\'s lesson. Stand for true, sit for false.',
    resources: ['5 true or false statements about today\'s lesson'],
    steps: [
      'Say: "I\'ll read a statement. Stand up if it\'s true, stay sitting if it\'s false."',
      'Read each statement and give 3 seconds.',
      'Reveal the answer, and fix any common mistake in one sentence.',
      'Do all 5, then say: "Sit down and shake out your hands."'
    ],
    seatedVersion: 'thumbs up or down.'
  },
  {
    id: 'odd-one-out', name: 'Odd one out', group: GENERAL_GROUP, type: 'perk', years: 'Any', minutes: '3',
    about: 'four words from the topic on the board. Which one doesn\'t belong, and why?',
    resources: ['four words from your topic, written on the board'],
    steps: [
      'Write four words from your topic on the board.',
      'Say: "Which one is the odd one out? Talk to your partner for 30 seconds."',
      'Take two or three answers.',
      'Say: "There can be more than one right answer, as long as your reason is good."'
    ]
  },
  {
    id: 'alphabet-race', name: 'Alphabet race', group: GENERAL_GROUP, type: 'perk', years: 'Any', minutes: '3',
    about: 'pairs list a topic word for as many letters of the alphabet as they can in 90 seconds.',
    resources: ['scrap paper and a pen per pair'],
    steps: [
      'Say: "With your partner, write A to Z down the side of the page."',
      'Say: "You have 90 seconds to write a word from our topic for as many letters as you can. Go!"',
      'Call time. Say: "Hands up if you got 10 or more… 15 or more?"',
      'Ask the winning pair for their hardest letter.'
    ]
  },
  {
    id: 'board-sketch', name: 'Board sketch', group: GENERAL_GROUP, type: 'perk', years: 'Any', minutes: '3–4',
    about: 'a student draws a key word on the board, and the class guesses it. No letters or numbers allowed.',
    resources: ['5 key words from your topic, on slips of paper', 'a whiteboard marker'],
    steps: [
      'Choose a student and hand them a word.',
      'Say: "Draw this on the board. No letters, no numbers, no talking. You have 30 seconds."',
      'The class calls out guesses. Whoever gets it draws the next word.',
      'Play until the 5 words are used.'
    ]
  },
  {
    id: 'rock-paper-scissors', name: 'Rock-paper-scissors cheer squad', group: GENERAL_GROUP, type: 'perk', years: 'Any', minutes: '2–3', position: 'moving', noise: 'loud',
    about: 'whoever loses becomes the winner\'s cheer squad, until there are two finalists with half the room cheering each.',
    resources: [],
    steps: [
      'Say: "Stand up and find a partner. Play rock-paper-scissors."',
      'Say: "If you lose, follow your winner and cheer their name. Winners, find another winner."',
      'Keep going until there are two players left, each with a cheer squad.',
      'Play the final, then say: "Big cheer, and back to your seats in 10, 9, 8…"'
    ]
  },

  // ---------- Calm (any subject) ----------
  {
    id: 'long-exhale', name: 'Long-exhale breathing', group: 'calm', type: 'calm', years: 'Any', minutes: '1–2', position: 'seated', noise: 'silent',
    resources: [],
    steps: [
      'Say: "Feet flat, hands in your lap. Close your eyes, or look down at your desk."',
      'Say: "Breathe in through your nose for 4… and out slowly for 6." Count out loud for 6–8 rounds, slowing your voice down.',
      'Say: "One more on your own… open your eyes when you\'re ready."'
    ]
  },
  {
    id: 'box-breathing', name: 'Box breathing', group: 'calm', type: 'calm', years: 'Any', minutes: '1–2', position: 'seated', noise: 'silent',
    resources: [], resourcesOptional: 'a square drawn on the board',
    steps: [
      'Draw a square on the board.',
      'Say: "Follow my finger. In for 4… hold for 4… out for 4… hold for 4." Trace one side for each.',
      'Do 4 rounds, then say: "Back to normal breathing."'
    ]
  },
  {
    id: 'five-finger', name: 'Five-finger breathing', group: 'calm', type: 'calm', years: 'Any', minutes: '1', position: 'seated', noise: 'silent',
    resources: [],
    steps: [
      'Say: "Hold one hand up in front of you. With a finger of the other hand, you\'ll trace around it."',
      'Say: "Trace up your thumb as you breathe in… down as you breathe out." Keep going across every finger and back.',
      'Say: "Rest your hands. Notice how you feel."'
    ]
  },
  {
    id: 'grounding-54321', name: '5-4-3-2-1 grounding', group: 'calm', type: 'calm', years: 'Any', minutes: '2', position: 'seated', noise: 'silent',
    resources: [],
    steps: [
      'Say: "Do this in your head. You don\'t need to share."',
      'Say: "Find 5 things you can see… 4 things you can feel… 3 things you can hear… 2 things you can smell… and 1 thing you\'re looking forward to." Pause after each one.',
      'Say: "Take one slow breath, and we\'ll carry on."'
    ]
  },
  {
    id: 'listening-minute', name: 'Listening minute', group: 'calm', type: 'calm', years: 'Any', minutes: '1–2', position: 'seated', noise: 'silent',
    resources: [],
    steps: [
      'Say: "For one minute, we\'ll be completely silent and count how many different sounds we can hear."',
      'Time one minute in silence.',
      'Say: "How many did you hear? What was the quietest sound?" Take 2–3 answers.'
    ]
  },
  {
    id: 'squeeze-release', name: 'Squeeze and release', group: 'calm', type: 'calm', years: 'Any', minutes: '2', position: 'seated', noise: 'silent',
    resources: [],
    steps: [
      'Say: "Squeeze your hands into tight fists… hold for 5… and let go."',
      'Say: "Lift your shoulders up to your ears… hold for 5… and drop them."',
      'Say: "Press your feet into the floor… hold for 5… and relax."',
      'Say: "Notice how heavy and loose you feel now."'
    ]
  },
  {
    id: 'seated-stretch', name: 'Seated stretch', group: 'calm', type: 'calm', years: 'Any', minutes: '2', position: 'seated', noise: 'quiet',
    resources: [],
    steps: [
      'Say: "Sit tall. Reach both arms up high… and slowly bring them down."',
      'Say: "Drop your right ear towards your right shoulder… now the left."',
      'Say: "Roll your shoulders back three times… and forward three times."',
      'Say: "One big breath in… and out. Let\'s get back to it."'
    ]
  }
];
