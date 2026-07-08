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
];

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
