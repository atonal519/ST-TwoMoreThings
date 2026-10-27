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
