/**
 * An RFC 9309 robots.txt reader, resolving rules the way a crawler does.
 *
 * This was written inside src/lib/robots-txt.test.ts (US-645) and lived there,
 * which meant anything else needing to ask "would Googlebot fetch this URL?"
 * had to write a second parser. US-832 needed exactly that, so the parser moved
 * out here and the original test now imports it -- its assertions still pin the
 * behaviour, and there is one implementation rather than two that can disagree.
 *
 * The rule that makes robots.txt easy to get wrong: a crawler obeys the ONE
 * most specific group matching its user-agent and IGNORES every other group,
 * "User-agent: *" included. A named group replaces the wildcard group, it does
 * not extend it.
 */

export interface RobotsGroup {
  agents: string[];
  rules: Array<{ allow: boolean; pattern: string }>;
}

/** Parse into groups. Consecutive User-agent lines share one rule set. */
export function parseRobots(source: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let acceptingAgents = false;

  for (const raw of source.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(':').trim();

    if (key === 'user-agent') {
      if (!current || !acceptingAgents) {
        current = { agents: [], rules: [] };
        groups.push(current);
        acceptingAgents = true;
      }
      current.agents.push(value.toLowerCase());
    } else if (key === 'allow' || key === 'disallow') {
      if (!current) continue;
      acceptingAgents = false;
      // An empty Disallow means "nothing is disallowed" and carries no pattern.
      if (key === 'disallow' && value === '') continue;
      current.rules.push({ allow: key === 'allow', pattern: value });
    }
  }
  return groups;
}

/** The single group a crawler calling itself `agent` would obey. */
export function groupForAgent(groups: RobotsGroup[], agent: string): RobotsGroup {
  const needle = agent.toLowerCase();
  const named = groups.find((g) => g.agents.includes(needle));
  if (named) return named;
  const wildcard = groups.find((g) => g.agents.includes('*'));
  if (!wildcard) throw new Error('robots.txt has no wildcard group');
  return wildcard;
}

/** Turn a robots pattern into a regex: `*` is any run, `$` anchors the end. */
export function robotsPatternToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\\\$$/, '$');
  return new RegExp('^' + escaped);
}

/** Longest matching pattern wins; Allow wins an exact-length tie (RFC 9309). */
export function isAllowedByGroup(group: RobotsGroup, url: string): boolean {
  let best: { allow: boolean; length: number } | null = null;
  for (const { allow, pattern } of group.rules) {
    if (!robotsPatternToRegExp(pattern).test(url)) continue;
    if (!best || pattern.length > best.length || (pattern.length === best.length && allow)) {
      best = { allow, length: pattern.length };
    }
  }
  return best ? best.allow : true;
}
