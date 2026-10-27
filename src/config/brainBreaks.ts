// Brain breaks, copied from docs/brain-breaks.md (every break not marked ❌). Text is kept as written,
// including the "Say:" lines. To add more subjects later (English, Maths, Science), add a group to
// BREAK_GROUPS and entries with that group; nothing else needs to change.

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

export const BREAK_GROUPS: { id: string; label: string }[] = [
  { id: 'geography', label: 'Geography' },
  { id: 'history', label: 'History' },
  { id: 'economics-business', label: 'Economics and Business' },
  { id: 'civics', label: 'Civics and Citizenship' },
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

const PROJECTOR = ['projector and internet'];
const CHECK_LINK = '(check link)';

export const BRAIN_BREAKS: BrainBreak[] = [
  // ---------- Geography ----------
  {
    id: 'globle', name: 'Globle', group: 'geography', type: 'perk', years: '7–10', minutes: '3–5', link: 'https://globle-game.com/',
    about: 'a mystery country on a globe with no borders. Each guess turns a country redder the closer it is.',
    resources: PROJECTOR,
    steps: [
      'Say: "Today\'s mystery country is somewhere on this globe. Call out a country. Hands up, and I\'ll take one guess at a time."',
      'Enter the guesses and point out the hot and cold colours.',
      'After each guess, ask, "Which direction should we go next, and why?"',
      "Stop at 5 minutes, or when you've found it."
    ]
  },
  {
    id: 'worldle', name: 'Worldle', group: 'geography', type: 'perk', years: '7–12', minutes: '3', link: 'https://worldle.teuteuf.fr/',
    about: "guess the country from its outline. Each wrong guess shows the distance and direction.",
    resources: PROJECTOR,
    steps: [
      'Say: "Here\'s a country\'s shape. Talk to the person next to you for 20 seconds, then I\'ll take guesses."',
      'Enter guesses. Use the distance and arrow clues to reason out loud together.'
    ]
  },
  {
    id: 'travle', name: 'Travle', group: 'geography', type: 'perk', years: '8–12', minutes: '4–5', link: 'https://imois.in/games/travle/',
    about: 'get from one country to another by naming the countries in between, using as few as possible.',
    resources: PROJECTOR,
    steps: [
      'Say: "We need to get from [country A] to [country B] by land. Which country should we go through first?"',
      'Take suggestions and ask "Why that one?" before entering them.'
    ]
  },
  {
    id: 'seterra', name: 'Seterra map quiz', group: 'geography', type: 'perk', years: '7–9', minutes: '3', link: 'https://geoguessr.com/l/aus',
    linkNote: 'Oceania quizzes; pick Australian states, capitals, etc.',
    about: 'click the place on the map as fast as possible.',
    resources: PROJECTOR,
    steps: [
      'Say: "Class versus the clock. Call out where to click."',
      'Play once, then challenge them to beat the time next lesson.'
    ]
  },
  {
    id: 'room-map', name: 'Room map', group: 'geography', type: 'perk', years: '7–10', minutes: '3', position: 'moving',
    about: 'the classroom becomes a map. Students walk to where a place would be.',
    resources: [], resourcesOptional: 'N, S, E, W signs on the walls',
    steps: [
      'Say: "The front wall is north. The middle of the room is [Melbourne / Australia / the equator]."',
      '"Walk to where Sydney would be… now Perth… now Darwin." Change the places to fit the lesson.',
      'Ask 1–2 students to explain where they stood.'
    ],
    seatedVersion: 'students point instead.'
  },
  {
    id: 'country-chain', name: 'Country chain', group: 'geography', type: 'perk', years: '7–12', minutes: '2–3',
    about: 'each student names a country starting with the last letter of the previous one.',
    resources: [],
    steps: [
      'Say: "I\'ll start: Australia. Next person needs a country starting with A. No repeats, 5 seconds each."',
      'Go around the room. If someone gets stuck, the class can help.'
    ]
  },

  // ---------- History ----------
  {
    id: 'timeguessr', name: 'TimeGuessr', group: 'history', type: 'perk', years: '8–12', minutes: '4–5', link: 'https://timeguessr.com/',
    about: 'a historical photo. Guess the year and where it was taken.',
    resources: PROJECTOR,
    steps: [
      'Say: "Look closely at this photo. What clues tell us when this was? Clothes, cars, technology, buildings."',
      'Take 3–4 clues from students, then agree on a class guess for the year and place.',
      'Reveal, and ask, "Which clue was most useful?"'
    ]
  },
  {
    id: 'whentaken', name: 'WhenTaken', group: 'history', type: 'perk', years: '8–12', minutes: '4–5', link: 'https://whentaken.com/game',
    about: 'similar to TimeGuessr. Guess where and when a photo was taken.',
    resources: PROJECTOR,
    steps: ['same as TimeGuessr.'], stepsFrom: 'timeguessr'
  },
  {
    id: 'wikitrivia', name: 'Wikitrivia', group: 'history', type: 'perk', years: '8–12', minutes: '3–5', link: 'https://wikitrivia.tomjwatson.com/', linkNote: CHECK_LINK,
    about: 'place historical events in order on a timeline, with three lives.',
    resources: PROJECTOR,
    steps: [
      'Say: "Before or after? Hands up for before, hands down for after."',
      'Place the card where most of the class votes, and keep going until three lives are lost.'
    ]
  },
  {
    id: 'chronophoto', name: 'Chronophoto', group: 'history', type: 'perk', years: '7–12', minutes: '3', link: 'https://www.chronophoto.app/', linkNote: CHECK_LINK,
    about: 'guess the year a photo was taken by sliding a timeline.',
    resources: PROJECTOR,
    steps: [
      'Say: "Stand up if you think this photo is from before 1950, stay seated if after."',
      'Then narrow it down to a decade together.'
    ]
  },
  {
    id: 'human-timeline', name: 'Human timeline', group: 'history', type: 'perk', years: '7–10', minutes: '3–4', position: 'moving',
    about: 'students hold event cards and line up in the right order without talking.',
    resources: ['8–12 cards or sticky notes with events from your current unit (write them before class)'],
    steps: [
      'Hand out the cards. Say: "Without talking, line up across the front in the order these happened."',
      'Then the class checks the line and suggests swaps.',
      'Reveal the correct order.'
    ]
  },
  {
    id: 'who-am-i', name: 'Who am I?', group: 'history', type: 'perk', years: '7–12', minutes: '3',
    about: '20 yes/no questions to guess a historical figure from your unit.',
    resources: ['a name written down (or one student picks a figure from the unit)'],
    steps: [
      'Say: "I\'m thinking of someone from our unit. You have 20 yes/no questions to work out who."',
      'Keep a tally on the board.'
    ]
  },

  // ---------- Economics and Business ----------
  {
    id: 'then-and-now', name: 'Then and now prices', group: 'economics-business', type: 'perk', years: '8–12', minutes: '3–4', link: 'https://www.rba.gov.au/calculator',
    linkNote: 'RBA inflation calculator',
    about: "guess what an old price is worth in today's money.",
    resources: ['projector and internet, plus 2–3 old prices (e.g. a 1970 loaf of bread, a 1985 movie ticket)'],
    steps: [
      'Say: "In [year], [item] cost [price]. What would that be in today\'s money? Write your guess."',
      'Enter it in the calculator and reveal. Closest guess wins.',
      'Ask, "Why is it so different?"'
    ]
  },
  {
    id: 'rba-inflation-explorer', name: 'RBA Inflation Explorer', group: 'economics-business', type: 'perk', years: '9–12', minutes: '4–5',
    link: 'https://rba.gov.au/education/resources/digital-interactives/inflation-explorer/',
    about: "the RBA's interactive on how prices have changed.",
    resources: PROJECTOR,
    steps: ['explore one item together and ask students to predict before revealing.']
  },
  {
    id: 'higher-or-lower', name: 'Higher or Lower', group: 'economics-business', type: 'perk', years: '7–12', minutes: '3', link: 'https://www.higherlowergame.com/', linkNote: CHECK_LINK,
    about: 'which gets more Google searches? A good way into talking about demand and consumer trends.',
    resources: PROJECTOR,
    notes: 'Check the topics before class, as some can be off-topic.',
    steps: [
      'Say: "Higher or lower? Stand up for higher, stay seated for lower."',
      'Go with the majority. Keep the streak going as a class.'
    ]
  },
  {
    id: 'logo-from-memory', name: 'Logo from memory', group: 'economics-business', type: 'perk', years: '7–12', minutes: '3',
    about: 'draw a famous brand logo from memory in 30 seconds, then compare.',
    resources: ['scrap paper and a pen each'],
    steps: [
      'Say: "30 seconds: draw the [brand] logo from memory. Go!"',
      'Show the real logo on screen. Ask, "Why do brands spend so much on something you only half remember?"'
    ]
  },
  {
    id: 'sixty-second-pitch', name: '60-second pitch', group: 'economics-business', type: 'perk', years: '9–12', minutes: '4–5',
    about: 'pairs invent and pitch a product for a random everyday object.',
    resources: [], resourcesOptional: 'pick any object in the room',
    steps: [
      'Hold up an object. Say: "You have 60 seconds with your partner to turn this into a product. Name, price, who buys it."',
      'Two pairs pitch, and the class votes with thumbs.'
    ]
  },

  // ---------- Civics and Citizenship ----------
  {
    id: 'federal-state-local', name: 'Federal, state or local?', group: 'civics', type: 'perk', years: '7–9', minutes: '3–5', link: 'https://peo.gov.au/resource-hub/interactives',
    linkNote: 'Parliamentary Education Office: "Federal, state and local" game',
    about: 'sort responsibilities to the right level of government.',
    resources: PROJECTOR,
    steps: ['the class votes on each item (1 finger for federal, 2 for state, 3 for local) before you click.']
  },
  {
    id: 'referendum', name: 'Will your referendum pass?', group: 'civics', type: 'perk', years: '9–10', minutes: '4–5', link: 'https://peo.gov.au/resource-hub/interactives',
    about: 'adjust results to see whether a referendum succeeds (double majority).',
    resources: PROJECTOR,
    steps: ['ask, "What\'s the smallest number of states we need?", and test the class\'s prediction.']
  },
  {
    id: 'agree-disagree-line', name: 'Agree / disagree line', group: 'civics', type: 'perk', years: '7–12', minutes: '3', position: 'moving',
    about: 'students stand along a line from "strongly agree" to "strongly disagree".',
    resources: ['a statement linked to your unit (e.g. "The voting age should be 16")'],
    steps: [
      'Say: "Left wall is strongly agree, right wall is strongly disagree. Stand where you are."',
      "Ask one student from each end for a reason, then let people move if they've changed their mind."
    ],
    seatedVersion: 'show 1–5 fingers.'
  },

  // ---------- Calm (any subject) ----------
  {
    id: 'long-exhale', name: 'Long-exhale breathing', group: 'calm', type: 'calm', years: 'Any', minutes: '1–2', position: 'seated', noise: 'silent',
    resources: [],
    steps: [
      'Say: "Feet flat, hands in your lap. Close your eyes, or look down at your desk."',
      '"Breathe in through your nose for 4… out slowly for 6." Count out loud for 6–8 rounds, slowing your voice.',
      '"One more on your own… open your eyes when you\'re ready."'
    ]
  },
  {
    id: 'box-breathing', name: 'Box breathing', group: 'calm', type: 'calm', years: 'Any', minutes: '1–2', position: 'seated', noise: 'silent',
    resources: [], resourcesOptional: 'draw a square on the board',
    steps: ['trace a square on the board. "In for 4… hold 4… out 4… hold 4." Do 4 rounds.']
  },
  {
    id: 'five-finger', name: 'Five-finger breathing', group: 'calm', type: 'calm', years: 'Any', minutes: '1', position: 'seated', noise: 'silent',
    resources: [],
    steps: ['"Trace up your thumb as you breathe in, down as you breathe out. Keep going across every finger and back."']
  },
  {
    id: 'grounding-54321', name: '5-4-3-2-1 grounding', group: 'calm', type: 'calm', years: 'Any', minutes: '2', position: 'seated', noise: 'silent',
    resources: [],
    steps: ['"In your head: 5 things you can see… 4 you can feel… 3 you can hear… 2 you can smell… 1 thing you\'re looking forward to." Students don\'t share answers.']
  }
];
