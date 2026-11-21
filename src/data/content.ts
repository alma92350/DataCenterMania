import type { DemandProfileId, TechRole } from '../sim/types';

/** First-time tips (PRD §11, delivered by Sam the mentor). */
export const TIPS: Record<string, string> = {
  welcome: 'Welcome to the closet! That humming box is the whole company. Tap the rack to look inside.',
  firstAlarm: 'An alarm! Tap it in the alarm list, then send someone. Amber = warning, red = trouble.',
  raid: 'A failed disk in a RAID array is a warning: the server keeps running. If a second disk dies you lose data, so swap it before the timer runs out.',
  shop: 'Out of spare parts? Order them in the Shop. Deliveries take a while, so keep a few spares in stock.',
  install: 'To install a server, open a rack, tap an empty slot and pick a server from your stock.',
  heat: 'Racks hate heat. Every +10°C above 27°C doubles the failure risk. At 45°C servers shut down to protect themselves.',
  acOff: 'No AC means the rack heats up fast. Power off servers nobody uses (open the rack) or buy a portable AC in the Shop. Stay below 35°C for the third star!',
  spare: 'While a server is down, its customer is short of capacity. Open the rack and assign another server to that customer to cover the gap.',
  hire: 'You cannot be everywhere. Hire technicians in the Team tab and they will take the jobs you dispatch.',
  contracts: 'Customers pay daily, but only if you meet their SLA (uptime %). Miss it and you pay a penalty and lose reputation.',
  demand: 'Demand changes during the day. Pizza Rocket gets hungry at noon and at 19:00. Keep spare capacity for the peaks!',
  power: 'Each rack has a power budget. Go over it and the breaker trips, taking the whole rack down.',
  buildRack: 'Need more space? Buy a rack in the Shop, then use Build to place it on a free floor tile.',
  dataloss: 'Data loss! The second disk failed. Swap the disks and restore from backup. It takes much longer.',
  botched: 'Even the best technicians botch a job sometimes. Tired, clumsy or rushed people botch more.',
  aisles: 'Racks breathe in at the front and blow hot air out the back. If a rack\u2019s exhaust blows into another rack\u2019s front, that rack cooks. Face rows front-to-front (cold aisle) and back-to-back (hot aisle). Open a rack to rotate it.',
  roles: 'Specialists now! HW techs fix servers, HVAC techs look after coolers, network engineers handle switches and fiber. You can still do anything yourself, just slowly.',
  fatigue: 'People get tired. Tired techs work slower and botch more, and exhausted ones take a break in the staff room. A better coffee machine helps morale.',
  maintenance: 'Cooler filters clog over time. A dirty CRAC loses capacity and can break down. Send an HVAC tech to change the filter.',
  network: 'All traffic leaves through your ISP uplinks. If customers need more bandwidth than you have, everybody suffers. A second uplink on a separate route also protects you from fiber cuts.',
  backup: 'Power matters now. The UPS (batteries) bridges a power cut, and the generator takes over a few minutes later. But a generator nobody has tested often refuses to start. Open the Network tab and look at Backup power.',
  electrician: 'Hire an electrician from the Team tab: only they can test the generator, restart it and change worn UPS batteries.',
  gridDown: 'The utility power is out! Watch the battery minutes in the top bar. If the generator does not take over in time, every server goes dark.',
  generatorFail: 'The generator did not start! Send your electrician (or you, slowly) to start it before the batteries run out.',
  uplinkCut: 'A backhoe just cut your fiber! Until it is spliced, only your other uplinks carry traffic. A network engineer can fix it faster than the ISP.',
  switchDown: 'A top-of-rack switch died: every server in that rack is offline. Network engineers carry spare switches. Make sure you have some in stock.',
  autodispatch: 'Busy? Hire a Shift Lead in the Team tab. They send the best specialist to routine alarms and customer requests so you can focus on the big decisions. It costs a daily salary: you are buying back your attention.',
  cyber: 'Hackers! When an attack hits, tap Defend to play a 10-second game. Skip it with Auto-defend and you only get half the protection. Floods overload your customers, phishing locks technicians out of their accounts, and worms quarantine racks until someone cleans and re-images them.',
  malware: 'Quarantined racks are down until a technician cleans and re-images them. Send one from the Alarms tab (or let your Shift Lead do it).',
  quit: 'Unhappy, exhausted staff quit. Watch fatigue and morale in the Team tab.',
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

/** Specialists you can hire: each arrives with the system it looks after (PRD §21.5). */
export function availableRoles(features: readonly string[]): TechRole[] {
  return ['hw', ...(features.includes('maintenance') ? (['hvac'] as const) : []), ...(features.includes('network') ? (['net'] as const) : []), ...(features.includes('backup') ? (['elec'] as const) : [])];
}

export const traitOf = (id: string | null): TraitDef | undefined => TRAITS.find((t) => t.id === id);

export interface CustomerArchetype {
  name: string;
  description: string;
  units: [number, number];
  slaPct: number;
  pricePerUnit: number; // revenue per unit per day
  profile: DemandProfileId;
  duration: [number, number];
  bandwidth: number; // Gbps per unit at full demand
}

/** Fictional customers (PRD §5). */
export const CUSTOMERS: CustomerArchetype[] = [
  { name: "Grandma's Bakery", description: 'Tiny, stable, forgiving.', units: [1, 2], slaPct: 95, pricePerUnit: 180, profile: 'office', duration: [5, 10] , bandwidth: 0.1 },
  { name: 'Pizza Rocket', description: 'Food delivery: big peaks at lunch and dinner.', units: [4, 6], slaPct: 98, pricePerUnit: 260, profile: 'lunchDinner', duration: [4, 8] , bandwidth: 0.3 },
  { name: 'ByteBank', description: 'Fintech. Strict SLA, pays a lot.', units: [3, 5], slaPct: 99.5, pricePerUnit: 380, profile: 'office', duration: [5, 10] , bandwidth: 0.3 },
  { name: 'Nightly News', description: 'News site, busy in the evening.', units: [2, 4], slaPct: 98, pricePerUnit: 230, profile: 'evening', duration: [4, 8] , bandwidth: 0.6 },
  { name: 'Pixel Forge Games', description: 'Game studio. Steady load, gamers complain loudly.', units: [3, 6], slaPct: 99, pricePerUnit: 280, profile: 'evening', duration: [3, 6] , bandwidth: 0.8 },
  { name: 'Law & Order Mail', description: 'Law firm email. Office hours only.', units: [2, 3], slaPct: 99, pricePerUnit: 200, profile: 'office', duration: [5, 10] , bandwidth: 0.2 },
  { name: 'Crypto Bro Capital', description: 'Pays double. Flat-out load, every minute.', units: [3, 5], slaPct: 97, pricePerUnit: 400, profile: 'flat', duration: [2, 4] , bandwidth: 0.1 },
];

/**
 * Every contract has its own project name, so two contracts of the same customer can be told
 * apart everywhere (drop-downs, logs, post-mortems). Pools are used in order, then numbered.
 */
export const CONTRACT_PROJECTS: Record<string, string[]> = {
  "Grandma's Bakery": ['Till System', 'Online Shop', 'Cake Orders', 'Loyalty App'],
  'Pizza Rocket': ['Order App', 'Driver Tracking', 'Menu API', 'Promo Site'],
  ByteBank: ['Payments Gateway', 'Core Ledger', 'Fraud Scoring', 'Mobile Banking'],
  'Nightly News': ['News Website', 'Video Streams', 'Archive', 'Push Alerts'],
  'Pixel Forge Games': ['Game Servers', 'Matchmaking', 'Leaderboards', 'Patch CDN'],
  'Pixel Forge Launch': ['Launch Servers', 'Launch Login', 'Launch Store'],
  'Law & Order Mail': ['Email Cluster', 'Case Files', 'Document Vault', 'Client Portal'],
  'Crypto Bro Capital': ['Mining Rack', 'Trading Bot', 'Wallet Vault', 'Token Mint'],
};

export const GENERIC_PROJECTS = ['Main Site', 'Backoffice', 'Customer Portal', 'Data Lake', 'Analytics', 'Staging'];
