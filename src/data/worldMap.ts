import generatedWorld from './generatedWorld.json';
import { UNIT_ORDER } from './techAndBuildings';
import {
  CampaignOrigin,
  Nation,
  Region,
  TerrainType,
  UnitComposition,
  UnitType,
} from '../types/game';

interface GeneratedWorldPayload {
  nations: Record<string, Nation>;
  regions: Record<string, Region>;
  seaLanes: Array<[string, string]>;
}

const WORLD_DATA = generatedWorld as unknown as GeneratedWorldPayload;

export const SEA_LANES: Array<[string, string]> = WORLD_DATA.seaLanes;

export const BLOC_LABELS_2026: Record<Nation['bloc2026'], string> = {
  western: 'Western / NATO & Allies',
  brics_eurasian: 'BRICS+ / Eurasian Bloc',
  arab_islamic: 'Arab & Islamic League',
  global_south: 'Non-Aligned / Global South',
};

export const emptyUnits = (): UnitComposition => ({
  riflemen: 0,
  anti_tank: 0,
  mechanized: 0,
  mbt: 0,
  howitzer: 0,
  commandos: 0,
  frigate: 0,
  destroyer: 0,
  carrier: 0,
  interceptor: 0,
  gunship: 0,
  bomber: 0,
});

export const sumAllUnits = (u: Partial<UnitComposition> | undefined | null): number => {
  if (!u) return 0;
  let total = 0;
  for (const ut of UNIT_ORDER) {
    total += Math.max(0, Math.round(Number(u[ut]) || 0));
  }
  return total;
};

/**
 * Converts either legacy 4-category units ({ infantry, armor, artillery, specops })
 * or partial 12-unit records into a complete specific-unit roster.
 */
export const normalizeUnitComposition = (
  raw: Record<string, unknown> | undefined | null,
  ctx?: { terrain?: TerrainType; gdpTier?: number; troopsHint?: number }
): UnitComposition => {
  const out = emptyUnits();
  if (!raw || typeof raw !== 'object') {
    const t = Math.max(4, ctx?.troopsHint ?? 8);
    out.riflemen = Math.max(2, Math.round(t * 0.65));
    out.anti_tank = Math.max(1, Math.round(t * 0.2));
    out.commandos = Math.max(1, t - out.riflemen - out.anti_tank);
    return out;
  }

  // Check if already in new 12-unit format
  const hasNewKeys = UNIT_ORDER.some((k) => typeof raw[k] === 'number');
  if (hasNewKeys) {
    for (const ut of UNIT_ORDER) {
      out[ut] = Math.max(0, Math.round(Number(raw[ut]) || 0));
    }
    return out;
  }

  // Convert legacy 4-key units into specific Army, Navy & Air Force units
  const legInf = Math.max(0, Math.round(Number(raw.infantry) || 0));
  const legArm = Math.max(0, Math.round(Number(raw.armor) || 0));
  const legArt = Math.max(0, Math.round(Number(raw.artillery) || 0));
  const legOps = Math.max(0, Math.round(Number(raw.specops) || 0));

  const tier = ctx?.gdpTier ?? 2;
  const isCoastal = ctx?.terrain === 'Coastal';

  // Infantry -> Motorized Riflemen + Anti-Tank Vanguard
  const atShare = tier >= 2 ? 0.24 : 0.16;
  out.anti_tank = legInf >= 4 ? Math.max(1, Math.round(legInf * atShare)) : 0;
  out.riflemen = Math.max(0, legInf - out.anti_tank);

  // Armor -> IFV Mechanized + Main Battle Tanks
  if (legArm > 0) {
    out.mechanized = legArm >= 2 ? Math.max(1, Math.floor(legArm * 0.45)) : 0;
    out.mbt = Math.max(0, legArm - out.mechanized);
  }

  // Artillery -> SPG Heavy Howitzer
  out.howitzer = legArt;

  // Spec Ops -> Pathfinder Commandos
  out.commandos = legOps;

  // Give Coastal provinces realistic Navy ships & higher-GDP nations Air Force wings
  if (isCoastal && tier >= 2) {
    out.frigate = tier >= 3 ? 2 : 1;
    if (tier >= 3) out.destroyer = 1;
    if (tier >= 4) out.carrier = 1;
  }

  if (tier >= 2 && (legInf + legArm + legArt) >= 12) {
    out.interceptor = tier >= 3 ? 2 : 1;
    if (tier >= 3) {
      out.gunship = 1;
      out.bomber = 1;
    }
  }

  // Ensure at least 1 unit exists
  if (sumAllUnits(out) === 0) {
    out.riflemen = 4;
  }

  return out;
};

export const CAMPAIGN_ORIGINS: CampaignOrigin[] = [
  {
    id: 'guatemala_cell',
    name: 'Central American Liberation Cell',
    startRegionId: 'guatemala_1',
    hostCountryName: 'Guatemala',
    summary: 'Clandestine mountain cell embedded in northern Guatemala.',
    challengeNote: 'Small province to topple first; Mexico and the US sit right above.',
    startingFunds: 110,
    startingMaterials: 26,
    startingEnergy: 16,
    startingInfluence: 16,
    startingManpower: 46,
    startingTroops: 14,
    startingUnits: {
      ...emptyUnits(),
      riflemen: 7,
      anti_tank: 2,
      howitzer: 1,
      commandos: 4,
    },
  },
  {
    id: 'serbia_cell',
    name: 'Balkan Underground Syndicate',
    startRegionId: 'serbia_1',
    hostCountryName: 'Serbia',
    summary: 'Urban & mountain underground cell operating inside Serbia.',
    challengeNote: 'Rich European trade neighbors, but surrounded by NATO & EU nations once exposed.',
    startingFunds: 120,
    startingMaterials: 28,
    startingEnergy: 18,
    startingInfluence: 14,
    startingManpower: 48,
    startingTroops: 15,
    startingUnits: {
      ...emptyUnits(),
      riflemen: 7,
      anti_tank: 2,
      mechanized: 1,
      mbt: 1,
      howitzer: 1,
      commandos: 3,
    },
  },
  {
    id: 'mali_cell',
    name: 'Sahel Insurgent Vanguard',
    startRegionId: 'mali_1',
    hostCountryName: 'Mali',
    summary: 'Desert guerrilla movement hidden across northern Sahel corridors.',
    challengeNote: 'Easy to hide early on, but severe cash & steel scarcity demands careful borrowing.',
    startingFunds: 95,
    startingMaterials: 22,
    startingEnergy: 22,
    startingInfluence: 18,
    startingManpower: 44,
    startingTroops: 14,
    startingUnits: {
      ...emptyUnits(),
      riflemen: 6,
      anti_tank: 2,
      mechanized: 1,
      commandos: 5,
    },
  },
  {
    id: 'jordan_cell',
    name: 'Levant Crescent Underground',
    startRegionId: 'jordan_1',
    hostCountryName: 'Jordan',
    summary: 'Covert desert & urban resistance cell nestled in the Levant.',
    challengeNote: 'Direct access to Middle Eastern oil & Gulf lenders once your regime stabilizes.',
    startingFunds: 110,
    startingMaterials: 24,
    startingEnergy: 24,
    startingInfluence: 15,
    startingManpower: 46,
    startingTroops: 14,
    startingUnits: {
      ...emptyUnits(),
      riflemen: 6,
      anti_tank: 2,
      mbt: 1,
      howitzer: 1,
      commandos: 4,
    },
  },
  {
    id: 'laos_cell',
    name: 'Mekong Revolutionary Front',
    startRegionId: 'laos_1',
    hostCountryName: 'Laos',
    summary: 'Riverine & highland cell operating inside Southeast Asia.',
    challengeNote: 'Close to Chinese and ASEAN supply chains; watch regional giants once exposed.',
    startingFunds: 105,
    startingMaterials: 26,
    startingEnergy: 16,
    startingInfluence: 15,
    startingManpower: 48,
    startingTroops: 14,
    startingUnits: {
      ...emptyUnits(),
      riflemen: 7,
      anti_tank: 2,
      howitzer: 1,
      commandos: 4,
    },
  },
  {
    id: 'bolivia_cell',
    name: 'Andean People’s Cell',
    startRegionId: 'bolivia_1',
    hostCountryName: 'Bolivia',
    summary: 'High-altitude miners and insurgent network in the central Andes.',
    challengeNote: 'Strong mineral base, flanked by Brazil, Chile, and Peru.',
    startingFunds: 105,
    startingMaterials: 28,
    startingEnergy: 18,
    startingInfluence: 15,
    startingManpower: 46,
    startingTroops: 14,
    startingUnits: {
      ...emptyUnits(),
      riflemen: 6,
      anti_tank: 2,
      howitzer: 2,
      commandos: 4,
    },
  },
];

export const createInitialNations = (): Record<string, Nation> =>
  JSON.parse(JSON.stringify(WORLD_DATA.nations)) as Record<string, Nation>;

export const createInitialRegions = (): Record<string, Region> => {
  const nations = WORLD_DATA.nations;
  const rawRegions = JSON.parse(JSON.stringify(WORLD_DATA.regions)) as Record<string, Region>;
  for (const r of Object.values(rawRegions)) {
    const hostTier = nations[r.hostNationId]?.gdpTier ?? 2;
    r.units = normalizeUnitComposition(
      r.units as unknown as Record<string, unknown>,
      {
        terrain: r.terrain,
        gdpTier: hostTier,
        troopsHint: r.troops,
      }
    );
    r.troops = sumAllUnits(r.units);
  }
  return rawRegions;
};

export const UNIT_BRANCH_ORDER: Array<{ branch: 'Army' | 'Navy' | 'Air Force'; types: UnitType[] }> = [
  {
    branch: 'Army',
    types: ['riflemen', 'anti_tank', 'mechanized', 'mbt', 'howitzer', 'commandos'],
  },
  {
    branch: 'Navy',
    types: ['frigate', 'destroyer', 'carrier'],
  },
  {
    branch: 'Air Force',
    types: ['interceptor', 'gunship', 'bomber'],
  },
];
