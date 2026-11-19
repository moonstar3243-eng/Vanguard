import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createMultiplayerGame } from './src/engine/gameEngine';
import {
  hydrateGameStateFromDocs,
  serializeGameStateToDocs,
} from './src/services/multiplayerService';

// 1. Verify 4-Player Blitz WW2 serialization has NO undefined values, NO nested arrays,
//    NO JSON stringification, and stays well below Firestore's 1 MiB document size limit.
const fourPlayerState = createMultiplayerGame(
  [
    { id: 'player', name: 'Host Alpha', originId: 'central_america', startingNationId: 'usa', combatStyle: 'blitz' },
    { id: 'player_2', name: 'Guest Bravo', originId: 'eastern_europe', startingNationId: 'germany', combatStyle: 'fortress' },
    { id: 'player_3', name: 'Guest Charlie', originId: 'horn_of_africa', startingNationId: 'uk', combatStyle: 'guerilla' },
    { id: 'player_4', name: 'Guest Delta', originId: 'se_asia', startingNationId: 'japan', combatStyle: 'infiltration' },
  ],
  'BLITZ',
  'Brutal',
  'ONLINE',
  'K9P4Q',
  'ww2_1939'
);

const { metaDoc, regionsDoc, nationsDoc } = serializeGameStateToDocs(
  fourPlayerState,
  'K9P4Q',
  1,
  'uid_host_123'
);

const assertNoNestedArraysOrUndefined = (val: unknown, path: string, insideArray = false) => {
  assert.notEqual(val, undefined, `Found undefined at ${path}`);
  if (val === null || typeof val !== 'object') return;
  if (Array.isArray(val)) {
    assert.ok(!insideArray, `Nested array detected at ${path}`);
    val.forEach((item, idx) => assertNoNestedArraysOrUndefined(item, `${path}[${idx}]`, true));
    return;
  }
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    assertNoNestedArraysOrUndefined(v, `${path}.${k}`, false);
  }
};

// Replace FieldValue sentinels with placeholder Dates before deep-checking
const sanitizeTimestamps = (obj: Record<string, unknown>) => ({
  ...obj,
  updatedAt: new Date().toISOString(),
});

assertNoNestedArraysOrUndefined(sanitizeTimestamps(metaDoc as unknown as Record<string, unknown>), 'metaDoc');
assertNoNestedArraysOrUndefined(sanitizeTimestamps(regionsDoc as unknown as Record<string, unknown>), 'regionsDoc');
assertNoNestedArraysOrUndefined(sanitizeTimestamps(nationsDoc as unknown as Record<string, unknown>), 'nationsDoc');

const metaBytes = Buffer.byteLength(JSON.stringify(sanitizeTimestamps(metaDoc as unknown as Record<string, unknown>)), 'utf8');
const regionsBytes = Buffer.byteLength(JSON.stringify(sanitizeTimestamps(regionsDoc as unknown as Record<string, unknown>)), 'utf8');
const nationsBytes = Buffer.byteLength(JSON.stringify(sanitizeTimestamps(nationsDoc as unknown as Record<string, unknown>)), 'utf8');

assert.ok(metaBytes < 500_000, `metaDoc too large: ${metaBytes} bytes`);
assert.ok(regionsBytes < 500_000, `regionsDoc too large: ${regionsBytes} bytes`);
assert.ok(nationsBytes < 500_000, `nationsDoc too large: ${nationsBytes} bytes`);

// 2. Verify full hydration fidelity (705 provinces, 197 nations, 4 players, aiWars)
const hydrated = hydrateGameStateFromDocs(
  metaDoc as Parameters<typeof hydrateGameStateFromDocs>[0],
  regionsDoc as Parameters<typeof hydrateGameStateFromDocs>[1],
  nationsDoc as Parameters<typeof hydrateGameStateFromDocs>[2]
);

assert.equal(Object.keys(hydrated.regions).length, Object.keys(fourPlayerState.regions).length);
assert.equal(Object.keys(hydrated.nations).length, Object.keys(fourPlayerState.nations).length);
assert.equal(hydrated.players.length, 4);
assert.equal(hydrated.aiWars.length, fourPlayerState.aiWars.length);
const sampleRegionId = Object.keys(fourPlayerState.regions).find(
  (id) => fourPlayerState.regions[id].ownerId === 'player'
)!;
assert.ok(sampleRegionId);
assert.equal(hydrated.regions[sampleRegionId].ownerId, 'player');
assert.equal(hydrated.regions[sampleRegionId].troops, fourPlayerState.regions[sampleRegionId].troops);
assert.equal(hydrated.players[1].unitLevels.mbt, 1);

// 3. Verify firestore.rules contains all Eight Pillars protections
const rulesText = fs.readFileSync('./firestore.rules', 'utf8');
assert.ok(rulesText.includes('allow read, write: if false;'), 'Missing global default-deny rule');
assert.ok(rulesText.includes('request.auth.token.email_verified == true'), 'Missing verified email guard');
assert.ok(rulesText.includes("code.matches('^[A-Z0-9]{5}$')"), 'Missing room code regex guard');
assert.ok(rulesText.includes('affectedKeys().hasOnly('), 'Missing affectedKeys allowlist on updates');
assert.ok(rulesText.includes("existing().status != 'FINISHED'"), 'Missing terminal state lock');
assert.ok(rulesText.includes('existsAfter('), 'Missing atomic batch launch check');
assert.ok(rulesText.includes('request.auth.uid in resource.data.seatUids'), 'Missing scoped list query guard');
assert.ok(rulesText.includes('isSeatUnchangedOrSelf('), 'Missing per-seat anti-tamper guard');
assert.ok(rulesText.includes('allow list: if false;'), 'Missing /game subcollection list block');

console.log(
  `ALL FIRESTORE RULES & SERIALIZATION TESTS PASSED (meta=${(metaBytes / 1024).toFixed(1)}KB, regions=${(regionsBytes / 1024).toFixed(1)}KB, nations=${(nationsBytes / 1024).toFixed(1)}KB)`
);
