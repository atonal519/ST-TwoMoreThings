// Only explicit platform labels are normalized; old category is a read-only fallback.
export function readForumTags(post) {
  const source = Object.hasOwn(post || {}, 'tags') ? post.tags : post?.category;
  return [...new Set((Array.isArray(source) ? source : typeof source === 'string' ? [source] : []).flatMap(value => {
    if (typeof value !== 'string') return [];
    let label = value.trim();
    if (label.startsWith('#') && label.endsWith('#')) label = label.slice(1, -1).trim();
    else if (label.startsWith('【') && label.endsWith('】')) label = label.slice(1, -1).trim();
    return label ? [label] : [];
  }))].slice(0, 2);
}

// Filters summarize the batch; per-post labels remain the stored platform data.
export function forumFilterTags(posts) {
  const counts = new Map();
  for (const post of posts) for (const tag of readForumTags(post)) {
    const row = counts.get(tag) || { tag, count: 0, first: counts.size };
    row.count++; counts.set(tag, row);
  }
  return [...counts.values()].filter(row => row.count >= 2)
    .sort((left, right) => right.count - left.count || left.first - right.first)
    .slice(0, 6).map(row => row.tag);
}
