import { GameState, WorldEvent } from '../types/game';

export const pickRandomWorldEvent = (state: GameState): WorldEvent | null => {
  // UNDERGROUND PHASE EVENTS (Police crackdowns, informer leaks, smuggling windfalls)
  if (state.phase === 'UNDERGROUND') {
    const cellRegion = state.regions[state.cellRegionId];
    const pool: WorldEvent[] = [
      {
        id: `police_sweep_${state.turn}`,
        title: `Security Raid in ${cellRegion?.name ?? 'Hideout'}`,
        category: 'Crisis',
        description:
          'Local intelligence officers intercepted encrypted dispatches and are sweeping safehouses across the district.',
        choices: [
          {
            id: 'bribe_inspectors',
            label: 'Bribe Police Commanders',
            effectHint: '-$45 Funds, -12% Suspicion',
            fundsDelta: -45,
            suspicionDelta: -12,
          },
          {
            id: 'burn_safehouse',
            label: 'Burn Safehouses & Scatter',
            effectHint: '-3 Underground Fighters, -16% Suspicion',
            targetRegionTroopsDelta: -3,
            suspicionDelta: -16,
          },
          {
            id: 'stand_ground',
            label: 'Hold Position in Silence',
            effectHint: '+14% Suspicion, preserves fighters and cash',
            suspicionDelta: 14,
          },
        ],
      },
      {
        id: `smuggler_convoy_${state.turn}`,
        title: 'Black-Market Arms Convoy',
        category: 'Opportunity',
        description:
          'Corrupt border guards offered to look the other way for an overnight shipment of surplus rifles and fuel.',
        choices: [
          {
            id: 'buy_arms',
            label: 'Acquire Surplus Arms',
            effectHint: '-$40 Funds, +12 Steel, +4 Fighters, +8% Suspicion',
            fundsDelta: -40,
            materialsDelta: 12,
            targetRegionTroopsDelta: 4,
            suspicionDelta: 8,
          },
          {
            id: 'broker_deal',
            label: 'Sell Intel to Rival Syndicates',
            effectHint: '+$65 Funds, -4% Suspicion',
            fundsDelta: 65,
            suspicionDelta: -4,
          },
        ],
      },
    ];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // EXPOSED PHASE EVENTS
  const activeId = state.players?.[state.activePlayerIndex]?.id ?? 'player';
  const ownedIds = Object.keys(state.regions).filter(
    (id) => state.regions[id].ownerId === activeId
  );
  if (ownedIds.length === 0) return null;

  const randomOwnedId = ownedIds[Math.floor(Math.random() * ownedIds.length)];
  const randomRegion = state.regions[randomOwnedId];
  const playerCount = ownedIds.length;
  const inDebt = state.resources.funds < 0;

  const pool: WorldEvent[] = [];

  if (inDebt) {
    pool.push({
      id: `debt_mutiny_${state.turn}`,
      title: 'Creditor Foreclosure & Pay Mutiny',
      category: 'Crisis',
      description:
        'Unpaid war debts have sparked anger among quartermasters and frontline regiments. Foreign creditors demand immediate collateral.',
      choices: [
        {
          id: 'austerity',
          label: 'Enforce Emergency Rationing',
          effectHint: '+$80 Funds, -8 Steel, +12% Global Unrest, -8 Industry Loyalty',
          fundsDelta: 80,
          materialsDelta: -8,
          globalUnrestDelta: 12,
          factionDelta: { industry: -8 },
        },
        {
          id: 'appease_troops',
          label: 'Promise Back-Pay With Influence',
          effectHint: '-12 Influence, -$40 Funds, +5 Military Loyalty',
          fundsDelta: -40,
          influenceDelta: -12,
          factionDelta: { military: 5 },
        },
        {
          id: 'default',
          label: 'Repudiate Foreign Creditors',
          effectHint: '-25% factory output for 2 turns, -4 Troops',
          productionDebuffTurns: 2,
          targetRegionId: randomOwnedId,
          targetRegionTroopsDelta: -4,
        },
      ],
    });
  }

  // Political Faction Crisis when loyalty drops
  if (
    state.factionLoyalty.military < 35 ||
    state.factionLoyalty.industry < 35 ||
    state.factionLoyalty.civic < 35
  ) {
    pool.push({
      id: `cabinet_crisis_${state.turn}`,
      title: 'Internal Cabinet Ultimatum',
      category: 'Politics',
      description:
        'Dissatisfied power brokers within your regime are threatening a general strike and command walkout unless concessions are granted.',
      choices: [
        {
          id: 'grant_concessions',
          label: 'Approve Emergency Concessions',
          effectHint: '-$95 Funds, -10 Influence, +18 Loyalty across all pillars',
          fundsDelta: -95,
          influenceDelta: -10,
          factionDelta: { military: 18, industry: 18, civic: 18 },
        },
        {
          id: 'purge_dissidents',
          label: 'Purge Opposition Leaders',
          effectHint: '+12% Global Unrest, -4 Troops, +10 Military Loyalty',
          globalUnrestDelta: 12,
          targetRegionId: randomOwnedId,
          targetRegionTroopsDelta: -4,
          factionDelta: { military: 10, civic: -10 },
        },
      ],
    });
  }

  pool.push(
    {
      id: `quake_${state.turn}`,
      title: `Seismic Quake Strikes ${randomRegion.name}`,
      category: 'Disaster',
      description: `A major tectonic rupture tore through ${randomRegion.name}, collapsing rail bridges, power substations, and barracks.`,
      choices: [
        {
          id: 'relief_effort',
          label: 'Mobilize Full Relief & Rebuild',
          effectHint: '-$90 Funds, -14 Steel, -10 Fuel, +8 Civic Loyalty',
          fundsDelta: -90,
          materialsDelta: -14,
          energyDelta: -10,
          targetRegionId: randomOwnedId,
          targetRegionTroopsDelta: -3,
          factionDelta: { civic: 8 },
        },
        {
          id: 'prioritize_military',
          label: 'Salvage Only Military Depots',
          effectHint: '+8 Steel, +16% Global Unrest, -10 Civic Loyalty',
          materialsDelta: 8,
          globalUnrestDelta: 16,
          targetRegionId: randomOwnedId,
          targetRegionTroopsDelta: -5,
          factionDelta: { civic: -10, military: 4 },
        },
      ],
    },
    {
      id: `energy_shock_${state.turn}`,
      title: 'Global Fuel & Grid Blackout',
      category: 'Disaster',
      description:
        'Severe storms and maritime blockades crippled regional power grids. Industrial assembly lines are grinding to a halt.',
      choices: [
        {
          id: 'strategic_reserves',
          label: 'Tap Emergency Fuel Reserves',
          effectHint: '-18 Fuel, -$55 Funds, keeps Industry happy',
          energyDelta: -18,
          fundsDelta: -55,
          factionDelta: { industry: 6 },
        },
        {
          id: 'curtail_civilians',
          label: 'Cut Civilian Power Grids',
          effectHint: '+12 Fuel, +14% Global Unrest, -8 Civic Loyalty',
          energyDelta: 12,
          globalUnrestDelta: 14,
          factionDelta: { civic: -8 },
        },
      ],
    },
    {
      id: `pandemic_${state.turn}`,
      title: 'Winter Outbreak in Field Camps',
      category: 'Disaster',
      description:
        'A fast-spreading respiratory outbreak hit dense urban garrisons and supply depots across your territory.',
      choices: [
        {
          id: 'quarantine_meds',
          label: 'Fund Field Hospitals & Quarantine',
          effectHint: '-$80 Funds, -10 Influence, -25% factory output for 1 turn',
          fundsDelta: -80,
          influenceDelta: -10,
          productionDebuffTurns: 1,
          factionDelta: { civic: 6 },
        },
        {
          id: 'march_through',
          label: 'Keep Factories Open at All Costs',
          effectHint: `-6 Troops in ${randomRegion.name}, +15% Global Unrest`,
          targetRegionId: randomOwnedId,
          targetRegionTroopsDelta: -6,
          globalUnrestDelta: 15,
          factionDelta: { military: -6, industry: 5 },
        },
      ],
    }
  );

  if (playerCount >= 6) {
    pool.push({
      id: `general_coup_${state.turn}`,
      title: 'Faction Split in High Command',
      category: 'Politics',
      description: `Ambitious commanders in ${randomRegion.name} are demanding autonomous control over war spoils and regional taxes.`,
      choices: [
        {
          id: 'purge_commanders',
          label: 'Arrest the Conspirators',
          effectHint: `-16 Influence, -5 Troops in ${randomRegion.name}, +10% Global Unrest`,
          influenceDelta: -16,
          targetRegionId: randomOwnedId,
          targetRegionTroopsDelta: -5,
          globalUnrestDelta: 10,
          factionDelta: { military: -10 },
        },
        {
          id: 'bribe_loyalists',
          label: 'Grant Command Stipends',
          effectHint: '-$130 Funds, +12 Military Loyalty',
          fundsDelta: -130,
          factionDelta: { military: 12 },
        },
      ],
    });
  }

  return pool[Math.floor(Math.random() * pool.length)];
};
