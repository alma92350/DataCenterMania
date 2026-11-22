/**
 * Ops Handbook (PRD v2 F13): one entry per system, unlocked as the system appears. Each says what it does
 * in the game and what it is in real life, including where the game simplifies.
 */
export interface HandbookEntry {
  id: string;
  icon: string;
  term: string;
  game: string;
  real: string;
  /** Feature flag that unlocks it, or 'always'. */
  unlock: string;
}

export const HANDBOOK: HandbookEntry[] = [
  { id: 'time', icon: '⏩', term: 'Time compression', unlock: 'always',
    game: 'One real second is three game minutes at 1× speed, so a day takes a few real minutes.',
    real: 'A disk fails every few years per server, not every few days. The game speeds failures up about a hundred times to keep every shift eventful.' },
  { id: 'sla', icon: '📏', term: 'SLA and uptime', unlock: 'always',
    game: 'Each customer is promised a share of time online. Miss it and you pay a penalty and lose reputation.',
    real: '99.9% uptime still allows about 8.8 hours of downtime a year. 99.99% allows under an hour. Every extra nine costs far more than the one before.' },
  { id: 'raid', icon: '💽', term: 'RAID', unlock: 'always',
    game: 'A failed disk is a warning: the server keeps running. A second failure before the swap means data loss.',
    real: 'RAID keeps copies of data across disks. It protects against a disk failure, not against deleting a file, and it is not a backup.' },
  { id: 'mttr', icon: '⏱️', term: 'MTTR', unlock: 'always',
    game: 'The timer on an alarm is how long you have before it gets worse. Faster response means less damage.',
    real: 'Mean time to repair is how long a fix takes on average. Good operations cut it with spares on the shelf, clear runbooks and the right person nearby.' },
  { id: 'postmortem', icon: '📋', term: 'Post-mortem', unlock: 'always',
    game: 'After an outage the game explains what happened and offers a one-tap fix.',
    real: 'A blameless review that asks what went wrong, why it was not caught, and what changes next time. The goal is to fix the system, not to blame a person.' },
  { id: 'spares', icon: '📦', term: 'Spares and N+1', unlock: 'contracts',
    game: 'Give each customer one server more than they need and keep spare parts in stock.',
    real: 'N+1 means one more unit than the minimum needed, so a single failure does not cause an outage. 2N means a full duplicate system.' },
  { id: 'power', icon: '🔌', term: 'Power budget and breakers', unlock: 'power',
    game: 'Each rack has a power budget. Go over it and the breaker trips and the whole rack goes dark.',
    real: 'Circuits are sized for a maximum load. Real servers have two power supplies on two separate feeds (A and B). The game uses one feed to keep things readable.' },
  { id: 'redundancy', icon: '🔀', term: 'A/B feeds and dual power supplies', unlock: 'redundancy',
    game: 'Every rack has two power feeds. A server with two power supplies (two legs) survives losing one feed or one supply.',
    real: 'Critical gear is dual-corded onto two independent power paths (A and B). The classic outage chain is: one leg fails and nobody fixes it, then the other one goes.' },
  { id: 'spof', icon: '⚠️', term: 'Single point of failure', unlock: 'redundancy',
    game: 'The red overlay marks racks where one failed feed takes servers down. Dual-cord them.',
    real: 'A single point of failure is any one component whose failure stops the service. Finding and removing them is the heart of resilient design.' },
  { id: 'heat', icon: '🌡️', term: 'Heat and cooling', unlock: 'coolers',
    game: 'Hotter racks fail more often, and above 45°C servers shut down to protect themselves.',
    real: 'Electronics fail faster when hot. Cooling often uses as much energy as the servers themselves, which is why efficiency (PUE) matters. The game shows one temperature per rack, real rooms track inlet and exhaust.' },
  { id: 'aisles', icon: '↔️', term: 'Hot and cold aisles', unlock: 'aisles',
    game: 'Face racks front-to-front so cold air meets the intakes and hot air leaves the other side.',
    real: 'Mixing hot exhaust with cold supply wastes cooling and creates hot spots. Containment (doors and panels) goes further and is a standard upgrade.' },
  { id: 'filters', icon: '🧻', term: 'Filters and maintenance', unlock: 'maintenance',
    game: 'Clean filters keep coolers at full strength. Change them before they clog.',
    real: 'Preventive maintenance is cheaper than repairs. Schedules are driven by run hours and condition, not by waiting for a failure.' },
  { id: 'uplinks', icon: '🌐', term: 'Uplinks and bandwidth', unlock: 'network',
    game: 'All traffic leaves through your internet links. A cut link or too much traffic hurts every customer.',
    real: 'Operators buy links from several carriers on physically separate routes. Two cables in the same trench are one cable to a backhoe.' },
  { id: 'fatigue', icon: '😴', term: 'Fatigue and shifts', unlock: 'fatigue',
    game: 'Tired technicians work slower and make more mistakes. Rested people are worth more than extra hours.',
    real: 'Human error is behind a large share of outages, and it rises with fatigue. Good operations plan rotas, handovers and rest.' },
  { id: 'noc', icon: '🖥️', term: 'NOC and remote hands', unlock: 'remote',
    game: 'The NOC lets you reboot a hung server from your desk, diagnose disks, and run firmware work remotely.',
    real: 'Most soft failures are fixed remotely through out-of-band management. People walk to the rack only for physical work: disks, cables, power supplies and coolers.' },
  { id: 'ups', icon: '🔋', term: 'UPS', unlock: 'backup',
    game: 'Batteries carry the racks for a few minutes while the generator starts. Batteries wear out and need replacing.',
    real: 'A UPS is a bridge, not a plan: real systems carry the load for about 5 to 15 minutes. Batteries age in a few years and should be tested.' },
  { id: 'generator', icon: '🛢️', term: 'Generator and testing', unlock: 'backup',
    game: 'An untested generator often refuses to start. Test it while the grid is up.',
    real: 'Generators are load-tested on a schedule. The most common cause of a backup power failure is a system nobody exercised.' },
  { id: 'ats', icon: '🔀', term: 'Transfer switch (ATS)', unlock: 'backup',
    game: 'The switch moves the load from the grid to the generator. If it sticks, the generator runs but does nothing.',
    real: 'The automatic transfer switch is a classic single point of failure. It needs regular exercising, and a manual transfer procedure for the day it fails.' },
  { id: 'fuel', icon: '⛽', term: 'Fuel', unlock: 'backup',
    game: 'A full tank lasts 24 hours. Refuel before a storm.',
    real: 'Sites hold 24 to 72 hours of fuel and have refuelling contracts, because a long outage can empty the tank when roads are blocked.' },
  { id: 'phishing', icon: '🎣', term: 'Phishing', unlock: 'cyber',
    game: 'A bad click locks a technician out of their account and lets the worm in.',
    real: 'Most breaches start with a person, not a machine. Check the sender, be wary of urgency, and report suspicious mail. Many companies run phishing drills.' },
  { id: 'worm', icon: '🪱', term: 'Malware and isolation', unlock: 'cyber',
    game: 'Isolating infected machines early stops the spread. Infected racks are cleaned and re-imaged.',
    real: 'Network segmentation limits how far an infection spreads. Responders isolate first, investigate second.' },
];

/** Entries unlocked by the given feature flags. */
export function handbookFor(features: readonly string[]): HandbookEntry[] {
  return HANDBOOK.filter((h) => h.unlock === 'always' || features.includes(h.unlock));
}
