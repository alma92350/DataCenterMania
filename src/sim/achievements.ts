import { CHAPTER_ORDER } from '../data/chapters';
import { overallUptimePct } from './selectors';
import { aiEffective } from './ai';
import { spofReport } from './spof';
import { pueAverage } from './site';
import type { ChapterId, DifficultyId, GameState } from './types';

/** Best stars per chapter and difficulty (same shape as the UI's saved progress). */
export type StarProgress = Partial<Record<ChapterId, Partial<Record<DifficultyId, number>>>>;

export interface AchievementDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  check: (s: GameState, progress: StarProgress) => boolean;
}

/** Chapter wins only: a Daily Challenge has its own achievement. */
const won = (s: GameState) => s.progress.status === 'won' && !s.dailyId;

/** PRD §16 / §21.7: achievements reward skill and curiosity, never power. */
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'firstFix', icon: '🔧', name: 'Have You Tried Turning It Off…', description: 'Fix your first incident.', check: (s) => s.stats.resolved >= 1 },
  { id: 'closetSurvivor', icon: '🧹', name: 'Closet Survivor', description: 'Finish the tutorial.', check: (s) => won(s) && s.chapter === 'ch0' },
  { id: 'coolHead', icon: '🧊', name: 'Cool Head', description: 'Keep the closet below 35°C all day.', check: (s) => won(s) && s.chapter === 'ch0' && s.stats.peakTemp < 35 },
  { id: 'flawlessShift', icon: '🌟', name: 'Flawless Shift', description: 'Earn three stars on a shift report.', check: (s) => s.shiftReports.some((r) => r.stars === 3) },
  { id: 'fiveNines', icon: '9️⃣', name: 'Five Nines', description: 'Finish a chapter with 99.999% SLA uptime.', check: (s) => won(s) && s.chapter !== 'ch0' && overallUptimePct(s) >= 99.999 },
  { id: 'backhoe', icon: '🚜', name: 'Survived the Backhoe', description: 'Win Colocation Floor with ≥ 99.5% uptime.', check: (s) => won(s) && s.chapter === 'ch3' && overallUptimePct(s) >= 99.5 },
  { id: 'cableWhisperer', icon: '🧶', name: 'Cable Whisperer', description: 'Finish all three ops projects in one chapter.', check: (s) => s.projects.length >= 3 },
  { id: 'customerDarling', icon: '💐', name: 'Customer Darling', description: 'Grant 10 customer requests in one chapter.', check: (s) => (s.stats.walkinsDone ?? 0) >= 10 },
  { id: 'itWasDns', icon: '🧙', name: 'It Was DNS (It Wasn’t)', description: 'Reboot 5 hung servers in one chapter.', check: (s) => (s.stats.reboots ?? 0) >= 5 },
  { id: 'hotStreak', icon: '🔥', name: 'Hot Streak', description: 'Keep every customer within SLA for 12 hours in a row.', check: (s) => s.streak.best >= 12 },
  { id: 'hackerHunter', icon: '🕶️', name: 'Hacker Hunter', description: 'Block 5 cyber attacks in one game.', check: (s) => s.cyber.blocked >= 5 },
  { id: 'phishPro', icon: '🎣', name: 'Catch of the Day', description: 'Judge all three emails right in Phish or Legit?', check: (s) => s.cyber.history.some((h) => h.kind === 'phish' && h.mode === 'played' && h.score >= 0.99) },
  { id: 'wormWrangler', icon: '🪱', name: 'Worm Wrangler', description: 'Cut the Spread without a single infected machine.', check: (s) => s.cyber.history.some((h) => h.kind === 'worm' && h.mode === 'played' && h.score >= 0.99) },
  { id: 'fullHouse', icon: '👥', name: 'Full House', description: 'Have 5 people on the team at once.', check: (s) => s.progress.maxTechs >= 5 },
  { id: 'lean', icon: '🪶', name: 'Lean and Mean', description: 'Win a chapter with only the starting team.', check: (s) => won(s) && s.chapter !== 'ch0' && s.progress.maxTechs <= (s.chapter === 'ch1' ? 1 : 2) },
  { id: 'onCallLegend', icon: '🔥', name: 'On-Call Legend', description: 'Win any chapter on On-Call Nightmare.', check: (s) => won(s) && s.difficulty === 'nightmare' },
  { id: 'dailyGrind', icon: '📅', name: 'Daily Grind', description: 'Complete a Daily Challenge.', check: (s) => s.progress.status !== 'playing' && !!s.dailyId },
  // v2.8: the enterprise, AI and campus chapters
  { id: 'greenMachine', icon: '🌱', name: 'Green Machine', description: 'Win with an average PUE of 1.35 or better.', check: (s) => won(s) && !!s.site && pueAverage(s) <= 1.35 },
  { id: 'circularEconomy', icon: '♻️', name: 'Circular Economy', description: 'Run free cooling, heat reuse and renewable power together.', check: (s) => !!s.site && s.site.economizer && s.site.heatReuse && s.site.renewable },
  { id: 'noSingleStrand', icon: '🧵', name: 'No Single Strand', description: 'Win with no single point of failure in power or cooling.', check: (s) => won(s) && s.racks.length > 0 && s.features.includes('redundancy') && Object.values(spofReport(s)).every((r) => r.power.length === 0 && !r.singleCooler) },
  { id: 'lightsStayedOn', icon: '🔋', name: 'The Lights Stayed On', description: 'Ride out a utility outage with no blackout.', check: (s) => (s.stats.outages ?? 0) >= 1 && (s.stats.blackoutMin ?? 0) === 0 },
  { id: 'byTheBook', icon: '📝', name: 'By the Book', description: 'Finish five planned changes without one going wrong.', check: (s) => (s.stats.changeDone ?? 0) >= 5 && (s.stats.changeFailed ?? 0) === 0 },
  { id: 'trainedToPerfection', icon: '🧠', name: 'Trained to Perfection', description: 'Win the AI Factory with 95% effective training time.', check: (s) => won(s) && s.chapter === 'ch8' && aiEffective(s) >= 95 },
  { id: 'coolCommander', icon: '🚨', name: 'Cool Commander', description: 'Close a major incident with a perfect score.', check: (s) => (s.incidentScores ?? []).some((x) => x >= 3) },
  { id: 'goodNeighbour', icon: '🌳', name: 'Good Neighbour', description: 'Win Hyperscale with community goodwill of 75 or more.', check: (s) => won(s) && !!s.campus && s.campus.goodwill >= 75 && !s.campus.moratorium },
  { id: 'worldTour', icon: '🌍', name: 'World Tour', description: 'Have four live campus sites at once.', check: (s) => (s.campus?.sites.filter((x) => x.status === 'live').length ?? 0) >= 4 },
  { id: 'gigawatt', icon: '🏭', name: 'One Point Twenty-One Gigawatts', description: 'Bring a gigawatt campus live.', check: (s) => !!s.campus?.sites.some((x) => x.tier === 'gigawatt' && x.status === 'live') },
  {
    id: 'architect', icon: '🏛️', name: 'Architect', description: 'Three stars on every chapter.',
    check: (_s, p) => CHAPTER_ORDER.every((ch) => Math.max(0, ...Object.values(p[ch] ?? {}).map((v) => v ?? 0)) >= 3),
  },
];

export function earnedAchievements(s: GameState, progress: StarProgress): string[] {
  return ACHIEVEMENTS.filter((a) => a.check(s, progress)).map((a) => a.id);
}

const TITLES: [number, string][] = [
  [0, 'Intern'], [3, 'Junior Sysadmin'], [6, 'Sysadmin'], [21, 'Senior Engineer'], [33, 'Architect'],
];

/** Career title from the best stars of each chapter (PRD §21.7). */
export function careerTitle(p: StarProgress): { title: string; stars: number; next: string | null; starsToNext: number } {
  const stars = CHAPTER_ORDER.reduce((sum, ch) => sum + Math.max(0, ...Object.values(p[ch] ?? {}).map((v) => v ?? 0)), 0);
  const nightmareWin = CHAPTER_ORDER.some((ch) => (p[ch]?.nightmare ?? 0) > 0);
  let idx = 0;
  TITLES.forEach(([min], i) => {
    if (stars >= min) idx = i;
  });
  if (stars >= 15 && nightmareWin) return { title: 'CTO', stars, next: null, starsToNext: 0 };
  const next = TITLES[idx + 1];
  return {
    title: TITLES[idx]![1], stars,
    next: next ? next[1] : 'CTO',
    starsToNext: next ? next[0] - stars : 0,
  };
}
