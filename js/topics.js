/**
 * Conversation topics with bilingual scaffolds.
 * English scaffolds help students who drew English.
 * Japanese scaffolds help students who drew Japanese.
 */

export const TOPICS = [
  {
    id: 'toystory',
    emoji: '🤠',
    name: { en: 'Toy Story', ja: 'トイ・ストーリー' },
    summaryJa: 'トイ・ストーリーについて、好きなキャラクターや映画の話。ウッディやバズの話題が多いよ。',
    scaffold: {
      en: [
        'Hey, did you see the new Toy Story thing?',
        'I loved Woody and Buzz when I was little.',
        'Which character is your favorite?',
        'The animation looks really cool now.',
        'Would you watch it with friends?',
      ],
      ja: [
        '新しいトイ・ストーリー、見た？',
        '小さい時、ウッディとバズが好きだった。',
        '一番好きなキャラは誰？',
        '今のアニメーション、すごくキレイだね。',
        '友達と一緒に見たい？',
      ],
    },
  },
  {
    id: 'mj',
    emoji: '🎤',
    name: { en: 'Michael Jackson Movie', ja: 'マイケル・ジャクソン映画' },
    summaryJa: 'マイケル・ジャクソンの映画や音楽について。有名な曲やダンスの話。',
    scaffold: {
      en: [
        'Have you heard about the Michael Jackson movie?',
        'I think his music is still really popular.',
        'Do you know any of his famous songs?',
        'The dancing in the movie looked amazing.',
        'Would you want to learn his dance moves?',
      ],
      ja: [
        'マイケルの映画、知ってる？',
        '今でも人気あるよね、音楽。',
        '有名な曲、知ってる？',
        '映画のダンス、すごかったね。',
        'ダンス、やってみたい？',
      ],
    },
  },
  {
    id: 'kpop',
    emoji: '🎵',
    name: { en: 'K-POP', ja: 'K-POP' },
    summaryJa: 'K-POPグループやMV、推しメンバー、ダンスやライブの話。',
    scaffold: {
      en: [
        'What K-POP group do you like lately?',
        'I saw a new music video — it was so good!',
        'Do you ever dance to K-POP songs?',
        'Who is your favorite member?',
        'Have you been to a concert or fan event?',
      ],
      ja: [
        '最近好きなK-POPグループは？',
        '新しいMV見た？めっちゃ良かった！',
        'K-POPのダンス、やったことある？',
        '推しメンバーは誰？',
        'ライブとか行ったことある？',
      ],
    },
  },
  {
    id: 'vtuber',
    emoji: '🎮',
    name: { en: 'V-Tubers', ja: 'Vtuber' },
    summaryJa: 'Vtuberの配信、好きな配信者、スパチャ、なりたい？などの話。',
    scaffold: {
      en: [
        'Do you watch any V-Tubers?',
        'I think their streams are really fun.',
        'Which V-Tuber do you like the most?',
        'Have you ever sent a super chat?',
        'Would you want to be a V-Tuber?',
      ],
      ja: [
        'Vtuber、見る？',
        '配信、めっちゃ面白いよね。',
        '好きなVtuberは誰？',
        'スパチャしたことある？',
        'Vtuberになりたい？',
      ],
    },
  },
  {
    id: 'anime',
    emoji: '🎬',
    name: { en: 'Anime', ja: 'アニメ' },
    summaryJa: '好きなアニメ、キャラ、最新の話についての会話。',
    scaffold: {
      en: ['What anime are you watching?', 'Who is your favorite character?', 'Did you see the latest episode?', 'Would you recommend it?', 'Do you read the manga too?'],
      ja: ['今見てるアニメは？', '推しキャラは？', '最新話見た？', 'おすすめする？', '漫画も読む？'],
    },
  },
  {
    id: 'fashion',
    emoji: '👟',
    name: { en: 'Fashion', ja: 'ファッション' },
    summaryJa: '服、靴、コーデ、好きなブランドの話。',
    scaffold: {
      en: ['What did you wear today?', 'Do you follow any fashion trends?', 'Where do you like to shop?', 'Sneakers or boots?', 'Who has the best style in class?'],
      ja: ['今日何着た？', '流行り追ってる？', 'どこで買う？', 'スニーカー派？', 'クラスで一番オシャレな人は？'],
    },
  },
  {
    id: 'sports',
    emoji: '⚽',
    name: { en: 'Sports', ja: 'スポーツ' },
    summaryJa: '好きなスポーツ、試合、部活、運動の話。',
    scaffold: {
      en: ['What sport do you play?', 'Did you watch any games lately?', 'Who is your favorite athlete?', 'Are you on a school team?', 'Do you exercise every day?'],
      ja: ['何のスポーツやってる？', '最近試合見た？', '好きな選手は？', '部活入ってる？', '毎日運動する？'],
    },
  },
  {
    id: 'games',
    emoji: '🕹',
    name: { en: 'Video Games', ja: 'ゲーム' },
    summaryJa: '好きなゲーム、マイクラ、フォートナイトなどの話。',
    scaffold: {
      en: ['What games do you play lately?', 'Console or mobile?', 'Do you play online with friends?', 'What is your favorite game ever?', 'Did you beat a hard level recently?'],
      ja: ['最近何のゲーム？', 'スマホ？ゲーム機？', '友達とオンライン？', '一番好きなゲームは？', '最近クリアした？'],
    },
  },
  {
    id: 'food',
    emoji: '🍜',
    name: { en: 'Food', ja: '食べ物' },
    summaryJa: '好きな食べ物、ラunch、コンビニ、レストランの話。',
    scaffold: {
      en: ['What did you eat for lunch?', 'What is your favorite snack?', 'Any good restaurants near school?', 'Sweet or salty?', 'Can you cook anything?'],
      ja: ['昼ごはん何食べた？', '好きなお菓子は？', '学校の近くでおいしい店ある？', '甘い派？しょっぱい派？', '料理できる？'],
    },
  },
];

export const TOPIC_IDS = TOPICS.map((t) => t.id).join('|');

export function topicSummaryJa(topicId) {
  const t = TOPICS.find((x) => x.id === topicId);
  return t?.summaryJa || '';
}

export function pickTopic(seed) {
  const idx = Math.abs(seed) % TOPICS.length;
  return TOPICS[idx];
}

export function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return h;
}
