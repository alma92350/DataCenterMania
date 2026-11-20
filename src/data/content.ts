import type { DemandProfileId } from '../sim/types';

/** First-time tips (PRD §11, delivered by Sam the mentor). */
export const TIPS: Record<string, string> = {
  welcome: 'Welcome to the closet! That humming box is the whole company. Tap the rack to look inside.',
  firstAlarm: 'An alarm! Tap it in the alarm list, then send someone. Amber = warning, red = trouble.',
  raid: 'A failed disk in a RAID array is a warning: the server keeps running. If a second disk dies you lose data, so swap it before the timer runs out.',
  shop: 'Out of spare parts? Order them in the Shop. Deliveries take a while, so keep a few spares in stock.',
  install: 'To install a server, open a rack, tap an empty slot and pick a server from your stock.',
  heat: 'Racks hate heat. Every +10°C above 27°C doubles the failure risk. At 45°C servers shut down to protect themselves.',
  acOff: 'Facilities switched off the office AC for the weekend. Turn off servers you do not need, or buy a portable AC.',
  hire: 'You cannot be everywhere. Hire technicians in the Team tab and they will take the jobs you dispatch.',
  contracts: 'Customers pay daily, but only if you meet their SLA (uptime %). Miss it and you pay a penalty and lose reputation.',
  demand: 'Demand changes during the day. Pizza Rocket gets hungry at noon and at 19:00. Keep spare capacity for the peaks!',
  power: 'Each rack has a power budget. Go over it and the breaker trips, taking the whole rack down.',
  buildRack: 'Need more space? Buy a rack in the Shop, then use Build to place it on a free floor tile.',
  dataloss: 'Data loss! The second disk failed. Swap the disks and restore from backup. It takes much longer.',
  botched: 'Even the best technicians botch a job sometimes. Tired, clumsy or rushed people botch more.',
};

export const FIRST_NAMES = ['Alex', 'Sam', 'Priya', 'Jonas', 'Mia', 'Kenji', 'Lea', 'Omar', 'Zoe', 'Ivan', 'Nina', 'Theo', 'Ada', 'Linus', 'Grace', 'Hugo', 'Ines', 'Raj'];
export const LAST_NAMES = ['Byte', 'Cable', 'Patch', 'Rack', 'Socket', 'Kernel', 'Router', 'Fiber', 'Volt', 'Packet', 'Cache', 'Stack'];

export interface TraitDef {
  id: string;
  name: string;
  description: string;
  speedMult: number;
  workMult: number;
  mistakeMult: number;
}

export const TRAITS: TraitDef[] = [
  { id: 'cableArtist', name: 'Cable Artist', description: 'Works 25% faster.', speedMult: 1, workMult: 1.25, mistakeMult: 1 },
  { id: 'coffee', name: 'Coffee-Powered', description: 'Walks 30% faster.', speedMult: 1.3, workMult: 1, mistakeMult: 1 },
  { id: 'clumsy', name: 'Clumsy', description: 'Botches jobs three times as often.', speedMult: 1, workMult: 1, mistakeMult: 3 },
  { id: 'oldTimer', name: 'Old Timer', description: 'Slow walker, never botches a job.', speedMult: 0.8, workMult: 1, mistakeMult: 0 },
];

export const traitOf = (id: string | null): TraitDef | undefined => TRAITS.find((t) => t.id === id);

export interface CustomerArchetype {
  name: string;
  description: string;
  units: [number, number];
  slaPct: number;
  pricePerUnit: number; // revenue per unit per day
  profile: DemandProfileId;
  duration: [number, number];
}

/** Fictional customers (PRD §5). */
export const CUSTOMERS: CustomerArchetype[] = [
  { name: "Grandma's Bakery", description: 'Tiny, stable, forgiving.', units: [1, 2], slaPct: 95, pricePerUnit: 180, profile: 'office', duration: [5, 10] },
  { name: 'Pizza Rocket', description: 'Food delivery: big peaks at lunch and dinner.', units: [4, 6], slaPct: 98, pricePerUnit: 260, profile: 'lunchDinner', duration: [4, 8] },
  { name: 'ByteBank', description: 'Fintech. Strict SLA, pays a lot.', units: [3, 5], slaPct: 99.5, pricePerUnit: 380, profile: 'office', duration: [5, 10] },
  { name: 'Nightly News', description: 'News site, busy in the evening.', units: [2, 4], slaPct: 98, pricePerUnit: 230, profile: 'evening', duration: [4, 8] },
  { name: 'Pixel Forge Games', description: 'Game studio. Steady load, gamers complain loudly.', units: [3, 6], slaPct: 99, pricePerUnit: 280, profile: 'evening', duration: [3, 6] },
  { name: 'Law & Order Mail', description: 'Law firm email. Office hours only.', units: [2, 3], slaPct: 99, pricePerUnit: 200, profile: 'office', duration: [5, 10] },
  { name: 'Crypto Bro Capital', description: 'Pays double. Flat-out load, every minute.', units: [3, 5], slaPct: 97, pricePerUnit: 400, profile: 'flat', duration: [2, 4] },
];
