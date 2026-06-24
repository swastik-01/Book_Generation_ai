import type { BookTemplate } from "./db";

type Draft = BookTemplate["draft"];

export const BUILTIN_TEMPLATES: Omit<BookTemplate, "createdAt">[] = [
  {
    id: "tpl-cozy-mystery",
    name: "Cozy Mystery",
    description:
      "Small-town sleuth, low violence, warm community, a single body, plenty of red herrings.",
    builtin: true,
    draft: {
      genre: ["Mystery"],
      subgenre: "Cozy mystery",
      tone: "Warm, witty, gently suspenseful",
      audience: "Adult cozy readers",
      pov: "First person",
      tense: "Past",
      arc: "Three-Act",
      targetChapters: 18,
      targetWordsPerChapter: 3000,
      premise:
        "A bookshop owner in a coastal village stumbles onto a body at the harbour and, between brewing tea for nosy regulars, untangles a decades-old secret the town would rather forget.",
      setting:
        "A picturesque coastal village in Cornwall, present day. Cobblestones, tea shops, fog at dawn.",
      characters: [
        {
          name: "Margot Lyle",
          role: "Protagonist · bookshop owner",
          traits: "Curious, dry-humoured, recently widowed, reads mystery novels obsessively",
        },
        {
          name: "DC Aaron Hale",
          role: "Sceptical detective",
          traits: "By-the-book, secretly grateful for Margot's instincts",
        },
        {
          name: "Pippa Croft",
          role: "Best friend · baker",
          traits: "Loyal, gossip magnet, runs the tea shop next door",
        },
        {
          name: "Edmund Vance",
          role: "Antagonist · town councillor",
          traits: "Charming on the surface, ruthless about appearances",
        },
      ],
    } satisfies Draft,
  },
  {
    id: "tpl-epic-fantasy",
    name: "Epic Fantasy",
    description:
      "Sweeping world, multiple POVs, prophecies, kingdoms in tension, magic with a cost.",
    builtin: true,
    draft: {
      genre: ["Fantasy"],
      subgenre: "Epic fantasy",
      tone: "Grand, mythic, occasionally intimate",
      audience: "Adult fantasy readers",
      pov: "Third person limited",
      tense: "Past",
      arc: "Hero's Journey",
      targetChapters: 28,
      targetWordsPerChapter: 4500,
      premise:
        "When the binding spells of the old gods begin to fray, a stable-girl with stolen blood, an exiled prince, and a heretic scholar must converge on a buried city before its sleeping power chooses a king.",
      setting:
        "A continent of three rival kingdoms — the salt-marsh empire of Vael, the ash-mountain holds of Korr, the tide-temples of the Drowned Coast.",
      characters: [
        {
          name: "Iren",
          role: "Protagonist · stable-girl with hidden lineage",
          traits: "Stubborn, observant, terrified of the magic in her hands",
        },
        {
          name: "Prince Halvar",
          role: "Exiled second son",
          traits: "Witty, hollowed by grief, raised on a knife's edge",
        },
        {
          name: "Sister Naelis",
          role: "Heretic scholar",
          traits: "Brilliant, untrusting, smells of ink and storm",
        },
        {
          name: "The Crowned One",
          role: "Antagonist · waking entity",
          traits: "Patient, ancient, speaks through dreams",
        },
      ],
    } satisfies Draft,
  },
  {
    id: "tpl-hard-scifi",
    name: "Hard Sci-Fi",
    description: "Plausible technology, scientist protagonists, ethical dilemmas, real physics.",
    builtin: true,
    draft: {
      genre: ["Sci-Fi"],
      subgenre: "Hard science fiction",
      tone: "Cerebral, wonder-tinged, urgent",
      audience: "Adult sci-fi readers",
      pov: "Third person limited",
      tense: "Past",
      arc: "Three-Act",
      targetChapters: 20,
      targetWordsPerChapter: 4000,
      premise:
        "A xenolinguist on a generation ship intercepts a signal that should not exist — a perfect mathematical mirror of human language, broadcast from a star that died ten thousand years ago.",
      setting:
        "The generation ship Argos, 142 years out of Sol, decelerating toward Tau Ceti. Hydroponic decks, faded murals, gravity that drifts with the spin.",
      characters: [
        {
          name: "Dr. Elinor Park",
          role: "Protagonist · xenolinguist",
          traits: "Methodical, lonely, fluent in twelve dead languages",
        },
        {
          name: "Captain Reyes",
          role: "Pragmatic commander",
          traits: "Carries the weight of three thousand sleeping colonists",
        },
        {
          name: "Dr. Avi Chen",
          role: "Astrophysicist, friend",
          traits: "Generous, sceptical, terrified of being right",
        },
      ],
    } satisfies Draft,
  },
  {
    id: "tpl-romance",
    name: "Contemporary Romance",
    description: "Two leads, real obstacles, emotional honesty, an earned happily-ever-after.",
    builtin: true,
    draft: {
      genre: ["Romance"],
      subgenre: "Contemporary romance",
      tone: "Heartfelt, sharp-tongued, hopeful",
      audience: "Adult romance readers",
      pov: "Dual third person limited",
      tense: "Past",
      arc: "Three-Act",
      targetChapters: 22,
      targetWordsPerChapter: 3500,
      premise:
        "A grief counsellor who insists she is fine and a celebrity chef rebuilding his reputation are forced to share a cliffside cottage for a winter — long enough to learn neither of them is.",
      setting:
        "An off-season coastal town in Maine. Wood smoke, ferry whistles, and snow that falls slow.",
      characters: [
        {
          name: "Tess Iverson",
          role: "Protagonist · grief counsellor",
          traits: "Empathic, sharp-edged, has not cried since the funeral",
        },
        {
          name: "Marco Bellini",
          role: "Love interest · disgraced chef",
          traits: "Generous, hot-tempered, hides behind the stove",
        },
      ],
    } satisfies Draft,
  },
  {
    id: "tpl-thriller",
    name: "Domestic Thriller",
    description:
      "Unreliable narrator, suburban menace, escalating dread, a twist that re-reads earlier chapters.",
    builtin: true,
    draft: {
      genre: ["Thriller"],
      subgenre: "Domestic thriller",
      tone: "Tense, intimate, unreliable",
      audience: "Adult thriller readers",
      pov: "First person",
      tense: "Present",
      arc: "Three-Act",
      targetChapters: 30,
      targetWordsPerChapter: 2800,
      premise:
        "A new mother begins receiving handwritten notes describing her own thoughts — word for word — and realises the only people in the house are her husband, the baby, and someone she cannot remember letting in.",
      setting:
        "A renovated Victorian on the edge of a London commuter town. Long hallways, baby monitors, a garden no one tends.",
      characters: [
        {
          name: "Hannah Cole",
          role: "Narrator · new mother",
          traits: "Exhausted, brilliant, no longer trusts her own memory",
        },
        {
          name: "James Cole",
          role: "Husband · architect",
          traits: "Calm, patient, perhaps too patient",
        },
      ],
    } satisfies Draft,
  },
  {
    id: "tpl-memoir",
    name: "Memoir",
    description: "Personal essays stitched into an arc — voice-driven, reflective, honest.",
    builtin: true,
    draft: {
      genre: ["Non-fiction"],
      subgenre: "Memoir",
      tone: "Reflective, candid, lyrical",
      audience: "General readers",
      pov: "First person",
      tense: "Past",
      arc: "Custom",
      targetChapters: 14,
      targetWordsPerChapter: 3500,
      premise:
        "A series of essays tracing how the author learned to live alongside a chronic illness — through kitchens, hospitals, gardens, and the quiet authority of small mornings.",
      setting: "Various — a childhood farm, a city flat, a hospital ward, a community garden.",
      characters: [],
    } satisfies Draft,
  },
  {
    id: "tpl-childrens",
    name: "Children's Picture Book",
    description:
      "Short, lyrical chapters perfect for illustrated spreads. Gentle conflict, warm resolution.",
    builtin: true,
    draft: {
      genre: ["Young Adult"],
      subgenre: "Children's picture book",
      tone: "Warm, playful, rhythmic",
      audience: "Ages 4–7",
      pov: "Third person limited",
      tense: "Present",
      arc: "Three-Act",
      targetChapters: 12,
      targetWordsPerChapter: 180,
      premise:
        "A small fox who is afraid of the dark discovers that every night creature is afraid of something — and that being a little brave together is the loveliest kind of brave.",
      setting: "A storybook forest at twilight.",
      characters: [
        {
          name: "Pip",
          role: "Protagonist · small fox",
          traits: "Curious, shy, sleeps with one ear up",
        },
        { name: "Old Owl", role: "Mentor", traits: "Wise, gentle, hates loud noises" },
      ],
    } satisfies Draft,
  },
  {
    id: "tpl-selfhelp",
    name: "Self-help / Practical",
    description: "Promise → method → proof → practice. Concrete frameworks per chapter.",
    builtin: true,
    draft: {
      genre: ["Non-fiction"],
      subgenre: "Self-help",
      tone: "Direct, generous, evidence-aware",
      audience: "Adult general readers",
      pov: "Second person",
      tense: "Present",
      arc: "Custom",
      targetChapters: 10,
      targetWordsPerChapter: 3000,
      premise:
        "A practical guide to building a creative practice that survives ordinary life — ten weekly habits, drawn from cognitive science and the working routines of working artists.",
      setting: "Reader's everyday life.",
      characters: [],
    } satisfies Draft,
  },
];
