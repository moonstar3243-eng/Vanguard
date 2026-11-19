import { UNIT_ORDER } from './techAndBuildings';
import { emptyUnits, sumAllUnits } from './worldMap';
import {
  Bloc2026,
  Nation,
  Region,
  ScenarioDef,
  ScenarioId,
} from '../types/game';

export const SCENARIOS: Record<ScenarioId, ScenarioDef> = {
  modern_2026: {
    id: 'modern_2026',
    name: 'Modern Geopolitics (2026)',
    yearLabel: '2026',
    summary:
      'Command any of 197 real nations in the multipolar 2026 order across Army, Navy, and Air Force divisions.',
    featuredCountries: [
      'united_states_of_america',
      'brazil',
      'germany',
      'japan',
      'india',
      'turkey',
      'nigeria',
      'poland',
      'argentina',
      'indonesia',
      'egypt',
      'south_korea',
    ],
    blocLabels: {
      western: 'Western / NATO & Allies',
      brics_eurasian: 'BRICS+ / Eurasian Bloc',
      arab_islamic: 'Arab & Islamic League',
      global_south: 'Non-Aligned / Global South',
    },
  },
  ww2_1939: {
    id: 'ww2_1939',
    name: 'World War II: 1939 Outbreak',
    yearLabel: '1939',
    summary:
      'September 1939. German Reich invades Poland, the British & French Empires mobilize, the USSR expands west, and Japan wages war in Asia.',
    featuredCountries: [
      'germany',
      'united_kingdom',
      'russia',
      'united_states_of_america',
      'japan',
      'france',
      'italy',
      'poland',
      'china',
      'spain',
      'brazil',
      'turkey',
    ],
    blocLabels: {
      western: 'Allied Powers',
      brics_eurasian: 'Comintern / Soviet Sphere',
      arab_islamic: 'Axis Powers',
      global_south: 'Neutral Nations',
    },
  },
  cold_war_1962: {
    id: 'cold_war_1962',
    name: 'Cold War Flashpoint (1962)',
    yearLabel: '1962',
    summary:
      'Height of the Cold War. NATO and the Warsaw Pact stand eyeball-to-eyeball with global carrier fleets, jet interceptors, and proxy wars.',
    featuredCountries: [
      'united_states_of_america',
      'russia',
      'united_kingdom',
      'france',
      'germany',
      'china',
      'cuba',
      'india',
      'egypt',
      'vietnam',
      'japan',
      'brazil',
    ],
    blocLabels: {
      western: 'NATO & Free World',
      brics_eurasian: 'Warsaw Pact & Communist Bloc',
      arab_islamic: 'Arab Nationalist Coalition',
      global_south: 'Non-Aligned Movement',
    },
  },
};

export const SCENARIO_LIST: ScenarioDef[] = [
  SCENARIOS.modern_2026,
  SCENARIOS.ww2_1939,
  SCENARIOS.cold_war_1962,
];

export const getScenarioBlocLabel = (
  scenarioId: ScenarioId | undefined,
  bloc: Bloc2026
): string => {
  const def = SCENARIOS[scenarioId ?? 'modern_2026'] ?? SCENARIOS.modern_2026;
  return def.blocLabels[bloc];
};

const transferTerritory = (
  regions: Record<string, Region>,
  nations: Record<string, Nation>,
  fromNationIds: string[],
  toNationId: string
) => {
  const target = nations[toNationId];
  if (!target) return;
  const fromSet = new Set(fromNationIds);
  for (const r of Object.values(regions)) {
    if (fromSet.has(r.ownerId)) {
      r.ownerId = toNationId;
      r.unrest = 16;
    }
  }
  for (const fId of fromNationIds) {
    if (nations[fId] && fId !== toNationId) {
      nations[fId] = {
        ...nations[fId],
        eliminated: true,
        atWar: false,
      };
    }
  }
};

const addNavalAirBoost = (
  regions: Record<string, Region>,
  nationId: string,
  extra: Partial<Record<(typeof UNIT_ORDER)[number], number>>
) => {
  const own = Object.values(regions).filter((r) => r.ownerId === nationId);
  if (own.length === 0) return;
  const coastal = own.find((r) => r.terrain === 'Coastal') ?? own[0];
  const inland = own[0];

  for (const [k, amt] of Object.entries(extra)) {
    const ut = k as (typeof UNIT_ORDER)[number];
    const targetReg =
      ut === 'frigate' || ut === 'destroyer' || ut === 'carrier'
        ? coastal
        : inland;
    targetReg.units = {
      ...emptyUnits(),
      ...targetReg.units,
      [ut]: (targetReg.units[ut] ?? 0) + (amt ?? 0),
    };
    targetReg.troops = sumAllUnits(targetReg.units);
  }
};

/**
 * Applies historical scenario borders, nation names/blocs, fleets, and initial wars.
 * Returns initial aiWars pairs.
 */
export const applyScenarioToWorld = (
  scenarioId: ScenarioId,
  regions: Record<string, Region>,
  nations: Record<string, Nation>
): Array<[string, string]> => {
  if (scenarioId === 'modern_2026') {
    return [];
  }

  if (scenarioId === 'ww2_1939') {
    // 1. Historical territorial consolidation (September 1939)
    // German Reich (Anschluss + Bohemia/Moravia)
    transferTerritory(regions, nations, ['austria', 'czechia'], 'germany');
    // Soviet Union (USSR republics)
    transferTerritory(
      regions,
      nations,
      [
        'ukraine',
        'belarus',
        'kazakhstan',
        'uzbekistan',
        'turkmenistan',
        'kyrgyzstan',
        'tajikistan',
        'georgia',
        'armenia',
        'azerbaijan',
        'moldova',
      ],
      'russia'
    );
    // British Empire
    transferTerritory(
      regions,
      nations,
      [
        'india',
        'pakistan',
        'bangladesh',
        'myanmar',
        'malaysia',
        'egypt',
        'sudan',
        's_sudan',
        'nigeria',
        'kenya',
        'ghana',
        'uganda',
        'tanzania',
        'zambia',
        'zimbabwe',
        'malta',
        'cyprus',
      ],
      'united_kingdom'
    );
    // French Republic & Empire
    transferTerritory(
      regions,
      nations,
      [
        'algeria',
        'morocco',
        'tunisia',
        'mali',
        'niger',
        'chad',
        'senegal',
        'c_te_d_ivoire',
        'burkina_faso',
        'guinea',
        'benin',
        'mauritania',
        'madagascar',
        'vietnam',
        'cambodia',
        'laos',
        'syria',
        'lebanon',
      ],
      'france'
    );
    // Kingdom of Italy
    transferTerritory(
      regions,
      nations,
      ['libya', 'eritrea', 'ethiopia', 'somalia', 'albania'],
      'italy'
    );
    // Empire of Japan
    transferTerritory(
      regions,
      nations,
      ['north_korea', 'south_korea', 'taiwan'],
      'japan'
    );

    // 2. Rename major powers & set WW2 bloc alignment
    // Note: in ww2_1939, bloc2026 meanings are:
    // western = Allied Powers, brics_eurasian = Comintern, arab_islamic = Axis Powers, global_south = Neutral
    for (const n of Object.values(nations)) {
      if (
        n.id === 'united_kingdom' ||
        n.id === 'france' ||
        n.id === 'poland' ||
        n.id === 'canada' ||
        n.id === 'australia' ||
        n.id === 'new_zealand' ||
        n.id === 'south_africa' ||
        n.id === 'united_states_of_america' ||
        n.id === 'china' ||
        n.id === 'norway' ||
        n.id === 'belgium' ||
        n.id === 'netherlands' ||
        n.id === 'greece'
      ) {
        n.bloc2026 = 'western';
      } else if (
        n.id === 'germany' ||
        n.id === 'italy' ||
        n.id === 'japan' ||
        n.id === 'hungary' ||
        n.id === 'romania' ||
        n.id === 'bulgaria' ||
        n.id === 'slovakia' ||
        n.id === 'thailand'
      ) {
        n.bloc2026 = 'arab_islamic';
      } else if (n.id === 'russia' || n.id === 'mongolia') {
        n.bloc2026 = 'brics_eurasian';
      } else {
        n.bloc2026 = 'global_south';
      }
    }

    if (nations.germany) {
      nations.germany.name = 'German Reich';
      nations.germany.color = '#475569';
      nations.germany.gdpTier = 4;
    }
    if (nations.russia) {
      nations.russia.name = 'Soviet Union (USSR)';
      nations.russia.color = '#991B1B';
      nations.russia.gdpTier = 4;
    }
    if (nations.united_kingdom) {
      nations.united_kingdom.name = 'British Empire';
      nations.united_kingdom.gdpTier = 4;
    }
    if (nations.france) {
      nations.france.name = 'French Republic';
      nations.france.gdpTier = 4;
    }
    if (nations.italy) {
      nations.italy.name = 'Kingdom of Italy';
      nations.italy.gdpTier = 3;
    }
    if (nations.japan) {
      nations.japan.name = 'Empire of Japan';
      nations.japan.gdpTier = 4;
    }
    if (nations.united_states_of_america) {
      nations.united_states_of_america.name = 'United States (1939)';
    }

    // 3. Historical fleets, armored divisions & air wings
    addNavalAirBoost(regions, 'germany', {
      mbt: 10,
      mechanized: 8,
      howitzer: 6,
      interceptor: 6,
      bomber: 5,
      destroyer: 3,
    });
    addNavalAirBoost(regions, 'united_kingdom', {
      carrier: 2,
      destroyer: 5,
      frigate: 6,
      interceptor: 6,
      bomber: 4,
      riflemen: 8,
    });
    addNavalAirBoost(regions, 'france', {
      mbt: 6,
      riflemen: 10,
      howitzer: 5,
      destroyer: 3,
      interceptor: 4,
    });
    addNavalAirBoost(regions, 'russia', {
      riflemen: 16,
      mbt: 10,
      howitzer: 8,
      interceptor: 5,
      bomber: 4,
    });
    addNavalAirBoost(regions, 'japan', {
      carrier: 2,
      destroyer: 5,
      frigate: 5,
      interceptor: 5,
      bomber: 5,
      riflemen: 10,
    });
    addNavalAirBoost(regions, 'united_states_of_america', {
      carrier: 2,
      destroyer: 4,
      mbt: 6,
      interceptor: 5,
      bomber: 5,
    });
    addNavalAirBoost(regions, 'italy', {
      destroyer: 3,
      frigate: 4,
      mbt: 4,
      interceptor: 3,
      bomber: 3,
    });

    // 4. Outbreak Wars of September 1939
    const canonical = (a: string, b: string): [string, string] =>
      a < b ? [a, b] : [b, a];
    return [
      canonical('germany', 'poland'),
      canonical('germany', 'united_kingdom'),
      canonical('germany', 'france'),
      canonical('china', 'japan'),
    ];
  }

  if (scenarioId === 'cold_war_1962') {
    // Soviet Union 1962 borders
    transferTerritory(
      regions,
      nations,
      [
        'ukraine',
        'belarus',
        'estonia',
        'latvia',
        'lithuania',
        'kazakhstan',
        'uzbekistan',
        'turkmenistan',
        'kyrgyzstan',
        'tajikistan',
        'georgia',
        'armenia',
        'azerbaijan',
        'moldova',
      ],
      'russia'
    );

    if (nations.russia) {
      nations.russia.name = 'Soviet Union (USSR)';
      nations.russia.color = '#991B1B';
      nations.russia.gdpTier = 4;
    }

    for (const n of Object.values(nations)) {
      if (
        n.id === 'russia' ||
        n.id === 'poland' ||
        n.id === 'czechia' ||
        n.id === 'slovakia' ||
        n.id === 'hungary' ||
        n.id === 'romania' ||
        n.id === 'bulgaria' ||
        n.id === 'cuba' ||
        n.id === 'china' ||
        n.id === 'north_korea' ||
        n.id === 'vietnam' ||
        n.id === 'mongolia'
      ) {
        n.bloc2026 = 'brics_eurasian';
      } else if (
        n.id === 'united_states_of_america' ||
        n.id === 'united_kingdom' ||
        n.id === 'france' ||
        n.id === 'germany' ||
        n.id === 'italy' ||
        n.id === 'canada' ||
        n.id === 'turkey' ||
        n.id === 'greece' ||
        n.id === 'norway' ||
        n.id === 'denmark' ||
        n.id === 'netherlands' ||
        n.id === 'belgium' ||
        n.id === 'portugal' ||
        n.id === 'japan' ||
        n.id === 'south_korea' ||
        n.id === 'australia'
      ) {
        n.bloc2026 = 'western';
      } else if (
        n.id === 'egypt' ||
        n.id === 'syria' ||
        n.id === 'iraq' ||
        n.id === 'algeria'
      ) {
        n.bloc2026 = 'arab_islamic';
      } else {
        n.bloc2026 = 'global_south';
      }
    }

    addNavalAirBoost(regions, 'united_states_of_america', {
      carrier: 3,
      destroyer: 6,
      interceptor: 7,
      bomber: 6,
      gunship: 4,
      mbt: 8,
    });
    addNavalAirBoost(regions, 'russia', {
      mbt: 14,
      mechanized: 10,
      howitzer: 8,
      interceptor: 7,
      bomber: 6,
      destroyer: 5,
      carrier: 1,
    });

    const canonical = (a: string, b: string): [string, string] =>
      a < b ? [a, b] : [b, a];
    return [
      canonical('vietnam', 'thailand'),
      canonical('north_korea', 'south_korea'),
    ];
  }

  return [];
};
