const text = value => typeof value === 'string' ? value.trim() : '';
const dateAndTime = (date, time) => [text(date), text(time)].filter(Boolean).join(' ');

export function publicationValue(item, clock, historical = false) {
  for (const key of ['publishedAt', 'published_at', 'postedAt', 'publishTime']) {
    const value = text(item?.[key]);
    if (value) return value;
  }
  const split = dateAndTime(text(item?.date) || item?.storyDate, text(item?.time) || item?.timeLabel);
  // 部分时间保持原样；不能把生成时的日期拼给一条只知道几点的历史动态。
  return split || (historical ? '' : dateAndTime(clock?.date, clock?.time));
}

function savedPublication(post) {
  // 新帖的空字符串明确表示未知；旧帖才读取原有剧情日期，createdAt始终只是生成时间。
  return Object.hasOwn(post, 'publishedAt') ? text(post.publishedAt) : dateAndTime(post.storyDate, post.timeLabel);
}

export function publicationLabel(post) {
  return savedPublication(post) || '过去';
}

function publicationParts(post) {
  const value = savedPublication(post);
  const match = /^[^\d]*?(\d{1,6})(?:[-/](\d{1,2})[-/](\d{1,2})|年(\d{1,2})月(\d{1,2})日)(?:(?:[ T]+|(?<=日))(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/u.exec(value);
  if (!match) return null;
  // 斜杠日期只认明确的四位以上年在前，不猜10/04/26之类的年月日顺序。
  if (value.includes('/') && match[1].length < 4) return null;
  const year = Number(match[1]), month = Number(match[2] || match[4]), day = Number(match[3] || match[5]);
  const hour = Number(match[6] || 0), minute = Number(match[7] || 0), second = Number(match[8] || 0);
  if (!month || !day || hour > 23 || minute > 59 || second > 59) return null;
  // 仅比较记录内的数值，不用Date修正虚构月长或换算时区；缺时分秒的0不写回记录。
  // 日期相同且同为零点时，有明确时间的记录排在仅日期的记录前。
  return [year, month, day, hour, minute, second, Number(match[6] !== undefined)];
}

export const hasPublicationDate = post => Boolean(publicationParts(post));

export function sortSocialPosts(posts) {
  return posts.map((post, index) => ({ post, index, parts: publicationParts(post) }))
    .sort((a, b) => {
      if (a.parts && b.parts) {
        for (let index = 0; index < a.parts.length; index++) {
          const difference = b.parts[index] - a.parts[index];
          if (difference) return difference;
        }
      } else if (a.parts || b.parts) return a.parts ? -1 : 1;
      return a.index - b.index;
    }).map(item => item.post);
}
