export const forumScope = scope => scope === 'circle' ? 'circle' : 'public';
export const forumData = (state, scope = 'public') => forumScope(scope) === 'circle' ? state.forum?.circle || { profile: null, posts: [] } : state.forum || { posts: [] };
export function circleProfile(value) {
  const name = typeof value?.name === 'string' ? value.name.trim() : '';
  const memberScope = typeof value?.memberScope === 'string' ? value.memberScope.trim() : '';
  return name && memberScope ? { name, memberScope } : null;
}
export const sameCircleProfile = (a, b) => JSON.stringify(circleProfile(a)) === JSON.stringify(circleProfile(b));
export const forumPostEntries = state => ['public', 'circle'].flatMap(scope => (forumData(state, scope).posts || []).map(post => ({ scope, post, profile: circleProfile(forumData(state, scope).profile) })));
export const withForumData = (state, scope, data) => ({ ...state, forum: forumScope(scope) === 'circle' ? { ...state.forum, circle: data } : { ...state.forum, ...data } });
