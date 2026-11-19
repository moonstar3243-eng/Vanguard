import fs from 'fs';
import path from 'path';
import { geoNaturalEarth1 } from 'd3-geo';
import * as topojson from 'topojson-client';

const worldTopo = JSON.parse(
  fs.readFileSync(
    path.resolve('node_modules/world-atlas/countries-50m.json'),
    'utf8'
  )
);

const EXCLUDE_NAMES = new Set([
  'Antarctica',
  'Fr. S. Antarctic Lands',
  'Heard I. and McDonald Is.',
  'S. Geo. and the Is.',
  'Br. Indian Ocean Ter.',
  'Indian Ocean Ter.',
  'Ashmore and Cartier Is.',
  'Siachen Glacier',
  'Pitcairn Is.',
  'Norfolk Island',
  'Saint Helena',
  'Falkland Is.',
  'Cayman Is.',
  'Turks and Caicos Is.',
  'British Virgin Is.',
  'U.S. Virgin Is.',
  'Bermuda',
  'Montserrat',
  'Anguilla',
  'Jersey',
  'Guernsey',
  'Isle of Man',
  'St-Martin',
  'St-Barthélemy',
  'Sint Maarten',
  'Aruba',
  'Curaçao',
  'St. Pierre and Miquelon',
  'Wallis and Futuna Is.',
  'Faeroe Is.',
  'Åland',
  'N. Mariana Is.',
  'Guam',
  'American Samoa',
  'Niue',
  'Cook Is.',
  'Macao',
  'Hong Kong',
  'N. Cyprus',
  'Fr. Polynesia',
  'New Caledonia',
  'Puerto Rico',
  'Greenland',
  'W. Sahara',
]);

// 2026 Geopolitical Blocs
const WESTERN_BLOC = new Set([
  'United States of America', 'Canada', 'United Kingdom', 'France', 'Germany',
  'Italy', 'Spain', 'Portugal', 'Netherlands', 'Belgium', 'Luxembourg',
  'Switzerland', 'Austria', 'Poland', 'Czechia', 'Slovakia', 'Hungary',
  'Romania', 'Bulgaria', 'Greece', 'Sweden', 'Norway', 'Finland', 'Denmark',
  'Iceland', 'Ireland', 'Estonia', 'Latvia', 'Lithuania', 'Croatia',
  'Slovenia', 'Ukraine', 'Japan', 'South Korea', 'Taiwan', 'Australia',
  'New Zealand', 'Israel', 'Albania', 'Montenegro', 'Macedonia', 'Kosovo',
  'Malta', 'Cyprus', 'Andorra', 'Monaco', 'San Marino', 'Liechtenstein',
]);

const BRICS_EURASIAN = new Set([
  'China', 'Russia', 'Iran', 'Belarus', 'North Korea', 'Venezuela', 'Cuba',
  'Nicaragua', 'Myanmar', 'Syria', 'Eritrea', 'Mali', 'Burkina Faso', 'Niger',
  'Central African Rep.', 'Zimbabwe', 'Laos', 'Cambodia', 'Bolivia',
]);

const ARAB_ISLAMIC = new Set([
  'Saudi Arabia', 'United Arab Emirates', 'Qatar', 'Kuwait', 'Bahrain', 'Oman',
  'Egypt', 'Turkey', 'Pakistan', 'Iraq', 'Jordan', 'Lebanon', 'Morocco',
  'Algeria', 'Tunisia', 'Libya', 'Yemen', 'Sudan', 'Somalia', 'Somaliland',
  'Djibouti', 'Mauritania', 'Palestine', 'Afghanistan', 'Azerbaijan',
  'Kazakhstan', 'Uzbekistan', 'Turkmenistan', 'Kyrgyzstan', 'Tajikistan',
  'Bangladesh', 'Malaysia', 'Indonesia', 'Brunei', 'Maldives', 'Comoros',
]);

const getBloc2026 = (name) => {
  if (WESTERN_BLOC.has(name)) return 'western';
  if (BRICS_EURASIAN.has(name)) return 'brics_eurasian';
  if (ARAB_ISLAMIC.has(name)) return 'arab_islamic';
  return 'global_south';
};

const REAL_PROVINCE_NAMES = {
  'United States of America': ['Pacific Coast', 'Rockies', 'Southwest', 'Great Plains', 'Texas & Oklahoma', 'Midwest', 'Deep South', 'Mid-Atlantic', 'New England & NY', 'Alaska'],
  'Canada': ['British Columbia', 'Alberta', 'Prairies', 'Ontario', 'Quebec', 'Atlantic Canada', 'Yukon', 'Nunavut'],
  'Russia': ['Kaliningrad & NW', 'Central Russia', 'Volga Basin', 'North Caucasus', 'Urals', 'Western Siberia', 'Central Siberia', 'Yakutia', 'Transbaikal', 'Far East'],
  'China': ['Xinjiang', 'Tibet', 'Qinghai-Gansu', 'Sichuan Basin', 'Inner Mongolia', 'Manchuria', 'North China Plain', 'Yangtze Delta', 'South China', 'Yunnan-Guizhou'],
  'India': ['Jammu & Punjab', 'Rajasthan', 'Gangetic Plain', 'Northeast', 'Gujarat', 'Deccan Plateau', 'Tamil & Kerala'],
  'Brazil': ['Amazonas', 'Para', 'Northeast', 'Mato Grosso', 'Minas Gerais', 'Sao Paulo', 'Rio Grande do Sul'],
  'Australia': ['Western Australia', 'Northern Territory', 'South Australia', 'Queensland', 'New South Wales', 'Victoria & Tasmania'],
  'Argentina': ['Patagonia', 'Cuyo', 'Pampas', 'Buenos Aires', 'Chaco-Norte'],
  'Kazakhstan': ['West Steppe', 'North Steppe', 'Central Steppe', 'Almaty South'],
  'Mexico': ['Baja & Sonora', 'Chihuahua', 'Central Highlands', 'Gulf Coast', 'Yucatan & South'],
  'Indonesia': ['Sumatra', 'Java', 'Kalimantan', 'Sulawesi', 'Papua'],
  'United Kingdom': ['Scotland', 'Northern England', 'Midlands & Wales', 'Southern England'],
  'France': ['Brittany & Normandy', 'Paris Basin', 'Eastern France', 'Aquitaine', 'Occitanie'],
  'Germany': ['North Germany', 'Rhineland', 'Saxony-Brandenburg', 'Bavaria', 'Baden-Wurttemberg'],
  'Ukraine': ['Western Ukraine', 'Kyiv North', 'Central Dnipro', 'Eastern Steppe', 'Black Sea Coast'],
  'Turkey': ['Thrace & Marmara', 'Aegean Coast', 'Central Anatolia', 'Eastern Highlands'],
  'Saudi Arabia': ['Hejaz', 'Najd', 'Eastern Province', 'Asir South'],
  'Iran': ['Azerbaijan-West', 'Tehran North', 'Central Desert', 'Khuzestan-Gulf'],
  'Japan': ['Hokkaido', 'Tohoku', 'Kanto', 'Kansai-Kyushu'],
};

const rawCountries = topojson.feature(
  worldTopo,
  worldTopo.objects.countries
).features;

const filtered = rawCountries.filter(
  (f) => f.properties?.name && !EXCLUDE_NAMES.has(f.properties.name)
);

const WIDTH = 1200;
const HEIGHT = 580;

const collection = {
  type: 'FeatureCollection',
  features: filtered,
};

const projection = geoNaturalEarth1().fitExtent(
  [
    [16, 16],
    [WIDTH - 16, HEIGHT - 16],
  ],
  collection
);

function ringArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function ringCentroid(ring) {
  let areaSum = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    const cross = x0 * y1 - x1 * y0;
    areaSum += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (Math.abs(areaSum) < 1e-6) {
    let sx = 0;
    let sy = 0;
    for (const pt of ring) {
      sx += pt[0];
      sy += pt[1];
    }
    return [sx / ring.length, sy / ring.length];
  }
  return [cx / (3 * areaSum), cy / (3 * areaSum)];
}

function ringBBox(ring) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

function pointInRing(pt, ring) {
  let inside = false;
  const [x, y] = pt;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function simplifyRing(pts, tol) {
  if (pts.length <= 6) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = out[out.length - 1];
    const cur = pts[i];
    const dx = cur[0] - prev[0];
    const dy = cur[1] - prev[1];
    if (dx * dx + dy * dy >= tol * tol) {
      out.push(cur);
    }
  }
  out.push(pts[pts.length - 1]);
  return out.length >= 3 ? out : pts;
}

// Deterministic PRNG for organic seed placement & natural river-like internal borders
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// General Sutherland-Hodgman half-plane clipper: keeps points where a*x + b*y <= c
function clipGeneralHalfPlane(poly, a, b, c) {
  if (poly.length < 3) return [];
  const out = [];
  const evalPt = (pt) => a * pt[0] + b * pt[1] - c;
  const intersect = (p1, p2) => {
    const d1 = evalPt(p1);
    const d2 = evalPt(p2);
    const denom = d1 - d2;
    const t = Math.abs(denom) < 1e-9 ? 0.5 : d1 / denom;
    return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
  };

  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const curIn = evalPt(cur) <= 1e-6;
    const prevIn = evalPt(prev) <= 1e-6;
    if (curIn) {
      if (!prevIn) out.push(intersect(prev, cur));
      out.push(cur);
    } else if (prevIn) {
      out.push(intersect(prev, cur));
    }
  }
  return out.length >= 3 ? out : [];
}

// Deterministic canonical edge perturbation so adjacent Voronoi cells share exact curving borders!
function perturbInternalBorders(cellPoly, outerRing) {
  if (cellPoly.length < 3) return cellPoly;

  // Build quick lookup set of original outer polygon vertices (rounded to 0.1)
  const outerSet = new Set(outerRing.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`));
  const isOnOuterEdge = (p1, p2) => {
    const k1 = `${p1[0].toFixed(1)},${p1[1].toFixed(1)}`;
    const k2 = `${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    if (outerSet.has(k1) && outerSet.has(k2)) return true;
    const mx = (p1[0] + p2[0]) / 2;
    const my = (p1[1] + p2[1]) / 2;
    // Check closeness to any outer segment
    for (let i = 0; i < outerRing.length; i++) {
      const a = outerRing[i];
      const b = outerRing[(i + 1) % outerRing.length];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len2 = dx * dx + dy * dy;
      if (len2 < 1e-6) continue;
      const t = Math.max(0, Math.min(1, ((mx - a[0]) * dx + (my - a[1]) * dy) / len2));
      const px = a[0] + t * dx;
      const py = a[1] + t * dy;
      if ((mx - px) ** 2 + (my - py) ** 2 < 0.35) return true;
    }
    return false;
  };

  // Canonical displacement along segment normal for shared internal borders
  const displaceMid = (a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 2.2) return [];
    // Order endpoints canonically so A->B and B->A compute identical midpoint + normal
    const flip = a[0] > b[0] || (Math.abs(a[0] - b[0]) < 1e-5 && a[1] > b[1]);
    const p = flip ? b : a;
    const q = flip ? a : b;
    const cdx = q[0] - p[0];
    const cdy = q[1] - p[1];
    const nx = -cdy / len;
    const ny = cdx / len;

    const hashNoise = (u, v) => {
      const n = Math.sin(u * 12.9898 + v * 78.233) * 43758.5453;
      return (n - Math.floor(n)) * 2 - 1; // -1 to 1
    };

    const amp = Math.min(len * 0.16, 2.4);
    const t1 = 0.33;
    const t2 = 0.67;
    const m1x = p[0] + cdx * t1;
    const m1y = p[1] + cdy * t1;
    const m2x = p[0] + cdx * t2;
    const m2y = p[1] + cdy * t2;

    const off1 = hashNoise(Math.round(m1x * 10), Math.round(m1y * 10)) * amp;
    const off2 = hashNoise(Math.round(m2x * 10), Math.round(m2y * 10)) * amp;

    const q1 = [m1x + nx * off1, m1y + ny * off1];
    const q2 = [m2x + nx * off2, m2y + ny * off2];
    return flip ? [q2, q1] : [q1, q2];
  };

  const out = [];
  for (let i = 0; i < cellPoly.length; i++) {
    const a = cellPoly[i];
    const b = cellPoly[(i + 1) % cellPoly.length];
    out.push(a);
    if (!isOnOuterEdge(a, b)) {
      const mids = displaceMid(a, b);
      for (const m of mids) {
        if (pointInRing(m, outerRing)) out.push(m);
      }
    }
  }
  return out;
}

// Organic Voronoi tessellation + 3 rounds of Lloyd relaxation clipped cleanly to polygon
function splitPolygonOrganic(poly, count, seedStr) {
  if (count <= 1 || poly.length < 3) return [poly];
  const [minX, minY, maxX, maxY] = ringBBox(poly);
  const w = maxX - minX;
  const h = maxY - minY;
  if (w < 3 && h < 3) return [poly];

  const rng = mulberry32(hashStr(seedStr));
  let seeds = [];
  let attempts = 0;
  // Rejection sample initial seeds inside polygon, spaced slightly apart
  while (seeds.length < count && attempts < 800) {
    attempts++;
    const x = minX + (0.08 + 0.84 * rng()) * w;
    const y = minY + (0.08 + 0.84 * rng()) * h;
    if (!pointInRing([x, y], poly)) continue;
    const minDist2 = ((w * h) / (count * 6.5));
    if (seeds.every(([sx, sy]) => (sx - x) ** 2 + (sy - y) ** 2 >= minDist2 * 0.35)) {
      seeds.push([x, y]);
    }
  }

  // Fallback jittered points around centroid if country is ultra-thin/diagonal
  const [fbX, fbY] = ringCentroid(poly);
  while (seeds.length < count) {
    const angle = (seeds.length / count) * Math.PI * 2 + rng() * 0.5;
    seeds.push([
      fbX + Math.cos(angle) * Math.max(0.6, w * 0.15),
      fbY + Math.sin(angle) * Math.max(0.6, h * 0.15),
    ]);
  }

  const computeVoronoiCells = (curSeeds) => {
    const cells = [];
    for (let i = 0; i < curSeeds.length; i++) {
      let cell = poly.map((p) => [p[0], p[1]]);
      const [xi, yi] = curSeeds[i];
      for (let j = 0; j < curSeeds.length; j++) {
        if (i === j || cell.length < 3) continue;
        const [xj, yj] = curSeeds[j];
        const a = xj - xi;
        const b = yj - yi;
        const mx = (xi + xj) / 2;
        const my = (yi + yj) / 2;
        const c = a * mx + b * my;
        cell = clipGeneralHalfPlane(cell, a, b, c);
      }
      cells.push(cell);
    }
    return cells;
  };

  // 3 rounds of Lloyd relaxation for balanced, organic administrative shapes
  for (let iter = 0; iter < 3; iter++) {
    const cells = computeVoronoiCells(seeds);
    seeds = seeds.map((s, idx) => {
      const c = cells[idx];
      if (!c || c.length < 3 || ringArea(c) < 0.4) return s;
      const [cx, cy] = ringCentroid(c);
      return pointInRing([cx, cy], poly) ? [cx, cy] : s;
    });
  }

  const finalCells = computeVoronoiCells(seeds)
    .filter((c) => c.length >= 3 && ringArea(c) >= 0.7)
    .map((c) => perturbInternalBorders(c, poly));

  return finalCells.length > 0 ? finalCells : [poly];
}

// Straight state-line parallel & meridian subdivision for USA
function splitByGeoLine(poly, lon1, lat1, lon2, lat2) {
  if (!poly || poly.length < 3) return [poly, []];
  const p1 = projection([lon1, lat1]);
  const p2 = projection([lon2, lat2]);
  if (!p1 || !p2) return [poly, []];
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const a = -dy;
  const b = dx;
  const c = -dy * p1[0] + dx * p1[1];
  return [
    clipGeneralHalfPlane(poly, a, b, c),
    clipGeneralHalfPlane(poly, -a, -b, -c),
  ];
}

function splitUSAProjected(mainRings) {
  // mainRings[0] = Lower 48, mainRings[1] = Alaska
  const lower48 = mainRings[0]?.pts ?? [];
  const alaska = mainRings[1]?.pts ?? [];

  const meridian = (poly, lon) => splitByGeoLine(poly, lon, 20, lon, 55);
  const parallel = (poly, lat) => splitByGeoLine(poly, -135, lat, -60, lat);

  const [westUS, centEastUS] = meridian(lower48, -104);
  const [pacific, mountain] = meridian(westUS, -116.5);
  const [rockies, southwest] = parallel(mountain, 37);

  const [plainsTx, eastUS] = meridian(centEastUS, -94.5);
  const [greatPlains, texas] = parallel(plainsTx, 37);

  const [northEastHalf, deepSouth] = parallel(eastUS, 36.5);
  const [midwest, atlanticNE] = meridian(northEastHalf, -81.5);
  const [newEngland, midAtlantic] = parallel(atlanticNE, 40.7);

  const parts = [
    pacific,
    rockies,
    southwest,
    greatPlains,
    texas,
    midwest,
    deepSouth,
    midAtlantic,
    newEngland,
    alaska,
  ];

  // Append any extra mainRings (e.g. Michigan UP or islands) to nearest/first ring
  const extraParts = mainRings.slice(2).map((r) => r.pts);
  return parts
    .map((pts, idx) => (idx === 0 ? [pts, ...extraParts] : [pts]))
    .filter((rings) => rings[0] && rings[0].length >= 3);
}

function makeHexagon(cx, cy, r = 2.6) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    pts.push([
      Number((cx + r * Math.cos(a)).toFixed(1)),
      Number((cy + r * Math.sin(a)).toFixed(1)),
    ]);
  }
  return pts;
}

function projectGeoToRings(geometry) {
  const polys =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const projected = [];
  for (const poly of polys) {
    const outer = poly[0];
    const pts = [];
    for (const coord of outer) {
      const p = projection(coord);
      if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
        if (pts.length > 0 && Math.abs(p[0] - pts[pts.length - 1][0]) > 450) {
          continue;
        }
        pts.push([Number(p[0].toFixed(1)), Number(p[1].toFixed(1))]);
      }
    }
    if (pts.length >= 3) {
      const simp = simplifyRing(pts, 0.7);
      const area = ringArea(simp);
      projected.push({ pts: simp, area });
    }
  }
  projected.sort((a, b) => b.area - a.area);
  if (projected.length > 0 && projected[0].area < 3.5) {
    const [cx, cy] = ringCentroid(projected[0].pts);
    projected[0] = { pts: makeHexagon(cx, cy, 2.5), area: 16 };
  }
  return projected.filter((p) => p.area >= 0.4);
}

const SLUG = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

const BLOC_COLORS = {
  western: ['#2563EB', '#3B82F6', '#1D4ED8', '#0284C7', '#4F46E5'],
  brics_eurasian: ['#7C3AED', '#9333EA', '#6D28D9', '#B91C1C', '#A21CAF'],
  arab_islamic: ['#059669', '#0D9488', '#15803D', '#CA8A04', '#B45309'],
  global_south: ['#D97706', '#EA580C', '#0891B2', '#65A30D', '#E11D48'],
};

function buildUnitMix(totalTroops, terrain, gdpTier) {
  let infShare = 0.56;
  let armShare = gdpTier >= 4 ? 0.24 : gdpTier === 3 ? 0.18 : 0.1;
  let artShare = gdpTier >= 3 ? 0.14 : 0.08;
  let opsShare = 1 - infShare - armShare - artShare;

  if (terrain === 'Mountain') {
    infShare += 0.08;
    opsShare += 0.08;
    armShare = Math.max(0.04, armShare - 0.16);
  } else if (terrain === 'Coastal') {
    opsShare += 0.06;
    armShare = Math.max(0.06, armShare - 0.06);
  }

  const infantry = Math.max(3, Math.round(totalTroops * infShare));
  const armor = Math.max(0, Math.round(totalTroops * armShare));
  const artillery = Math.max(0, Math.round(totalTroops * artShare));
  const specops = Math.max(1, totalTroops - infantry - armor - artillery);
  return {
    units: { infantry, armor, artillery, specops },
    troops: infantry + armor + artillery + specops,
  };
}

const nations = {};
const regions = {};
const regionPolys = {};

let colorIdx = 0;

for (const feat of filtered) {
  const name = feat.properties.name;
  const nationId = SLUG(name);
  const projected = projectGeoToRings(feat.geometry);
  if (projected.length === 0) continue;

  const totalArea = projected.reduce((acc, p) => acc + p.area, 0);
  let targetProvinces = 2;
  if (totalArea < 20) targetProvinces = 1;
  else if (totalArea < 65) targetProvinces = 2;
  else if (totalArea < 160) targetProvinces = 3;
  else if (totalArea < 360) targetProvinces = 4;
  else if (totalArea < 750) targetProvinces = 5;
  else if (totalArea < 1500) targetProvinces = 6;
  else if (totalArea < 3000) targetProvinces = 7;
  else if (totalArea < 6000) targetProvinces = 9;
  else targetProvinces = 10;

  if (name === 'United States of America' || name === 'Russia' || name === 'China') {
    targetProvinces = 10;
  } else if (name === 'Canada' || name === 'India' || name === 'Brazil') {
    targetProvinces = 8;
  } else if (name === 'Australia' || name === 'Indonesia') {
    targetProvinces = 6;
  } else if (
    ['United Kingdom', 'France', 'Germany', 'Japan', 'Ukraine', 'Turkey', 'Mexico', 'Argentina', 'Iran', 'Saudi Arabia'].includes(name)
  ) {
    targetProvinces = Math.max(targetProvinces, 4);
  }

  const bloc = getBloc2026(name);
  const palette = BLOC_COLORS[bloc];
  const color = palette[colorIdx % palette.length];
  colorIdx++;

  const gdpTier =
    totalArea > 1200 || ['United Kingdom', 'France', 'Germany', 'Japan', 'South Korea', 'Italy', 'Singapore', 'Switzerland'].includes(name)
      ? 4
      : totalArea > 280
      ? 3
      : totalArea > 40
      ? 2
      : 1;

  const mainRings = projected.filter((p) => p.area >= Math.max(2.5, totalArea * 0.04)).slice(0, 5);
  if (mainRings.length === 0) mainRings.push(projected[0]);

  let provinceParts = [];
  if (name === 'United States of America') {
    provinceParts = splitUSAProjected(mainRings);
  } else if (mainRings.length >= targetProvinces) {
    for (let i = 0; i < targetProvinces; i++) {
      provinceParts.push([mainRings[i].pts]);
    }
    for (let i = targetProvinces; i < mainRings.length; i++) {
      provinceParts[0].push(mainRings[i].pts);
    }
  } else {
    const mainSum = mainRings.reduce((acc, r) => acc + r.area, 0);
    let remaining = targetProvinces;
    for (let i = 0; i < mainRings.length; i++) {
      const share =
        i === mainRings.length - 1
          ? remaining
          : Math.max(1, Math.round((mainRings[i].area / mainSum) * targetProvinces));
      const alloc = Math.min(remaining - (mainRings.length - 1 - i), Math.max(1, share));
      remaining -= alloc;
      const splitRings = splitPolygonOrganic(mainRings[i].pts, alloc, `${nationId}_${i}`);
      for (const sr of splitRings) {
        provinceParts.push([sr]);
      }
    }
  }

  const extraIslets = projected.slice(mainRings.length, mainRings.length + 5).map((x) => x.pts);
  const realNames = REAL_PROVINCE_NAMES[name];
  const [nCx, nCy] = ringCentroid(mainRings[0].pts);

  const createdIds = [];
  provinceParts.forEach((rings, idx) => {
    const pId = `${nationId}_${idx + 1}`;
    createdIds.push(pId);
    const primaryRing = rings[0];
    let [cx, cy] = ringCentroid(primaryRing);
    if (!pointInRing([cx, cy], primaryRing)) {
      const pt = primaryRing[Math.floor(primaryRing.length / 2)];
      cx = (cx + pt[0]) / 2;
      cy = (cy + pt[1]) / 2;
    }

    let pName = name === 'United States of America' ? 'USA' : name;
    if (provinceParts.length > 1) {
      if (realNames && realNames[idx]) {
        pName = `${pName} · ${realNames[idx]}`;
      } else {
        const dx = cx - nCx;
        const dy = cy - nCy;
        const dir =
          Math.abs(dx) > Math.abs(dy)
            ? dx < 0
              ? 'West'
              : 'East'
            : dy < 0
            ? 'North'
            : 'South';
        pName = `${pName} (${dir} ${idx + 1})`;
      }
    }

    const allRings = idx === 0 ? [...rings, ...extraIslets] : rings;
    const svgPath = allRings
      .map(
        (r) =>
          'M ' + r.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L ') + ' Z'
      )
      .join(' ');

    const area = ringArea(primaryRing);
    const wealthFactor = bloc === 'western' ? 1.25 : bloc === 'brics_eurasian' ? 1.05 : 0.9;
    const rawTroops = Math.max(8, Math.min(46, Math.round((10 + Math.sqrt(area) * 1.0) * wealthFactor)));
    let terrain =
      area < 30 ? 'Coastal' : cy < 150 ? 'Mountain' : idx % 5 === 2 ? 'Urban' : 'Plains';
    if (pId === 'united_states_of_america_2') terrain = 'Mountain';
    if (pId === 'united_states_of_america_1' || pId === 'united_states_of_america_7') terrain = 'Coastal';
    const { units, troops } = buildUnitMix(rawTroops, terrain, gdpTier);

    let continent = 'Asia';
    if (cx < 410 && cy < 270) continent = 'North America';
    else if (cx < 440 && cy >= 270) continent = 'South America';
    else if (cx >= 440 && cx < 710 && cy < 208) continent = 'Europe';
    else if (cx >= 440 && cx < 710 && cy >= 208) continent = 'Africa';
    else if (cx >= 870 && cy >= 335) continent = 'Oceania';

    regions[pId] = {
      id: pId,
      name: pName,
      continent,
      terrain,
      ownerId: nationId,
      hostNationId: nationId,
      troops,
      units,
      unrest: 14,
      baseFunds: Math.max(10, Math.round((11 + Math.sqrt(area) * 0.65) * wealthFactor)),
      baseMaterials: Math.max(5, Math.round(5 + Math.sqrt(area) * 0.4)),
      baseEnergy: Math.max(5, Math.round(5 + Math.sqrt(area) * 0.38)),
      baseScience: Math.max(2, Math.round((2 + Math.sqrt(area) * 0.16) * wealthFactor)),
      buildings: {
        workshop: 0,
        refinery: 0,
        bank: 0,
        lab: 0,
        propaganda: 0,
        fortress: 0,
      },
      adjacentIds: [],
      svgPath,
      labelPos: [Number(cx.toFixed(1)), Number(cy.toFixed(1))],
    };
    regionPolys[pId] = primaryRing;
  });

  nations[nationId] = {
    id: nationId,
    name: name === 'United States of America' ? 'United States' : name,
    bloc2026: bloc,
    gdpTier,
    color,
    strokeColor: '#CBD5E1',
    relation: 0,
    pactTurns: 0,
    betrayalTendency: bloc === 'brics_eurasian' ? 0.42 : 0.32,
    atWar: false,
    eliminated: false,
    capitalRegionId: createdIds[0],
    strengthGrowth: gdpTier * 0.85,
  };
}

const rIds = Object.keys(regions);
const rBoxes = {};
for (const id of rIds) {
  rBoxes[id] = ringBBox(regionPolys[id]);
}

function addEdge(a, b) {
  if (a === b) return;
  if (!regions[a].adjacentIds.includes(b)) regions[a].adjacentIds.push(b);
  if (!regions[b].adjacentIds.includes(a)) regions[b].adjacentIds.push(a);
}

for (let i = 0; i < rIds.length; i++) {
  const aId = rIds[i];
  const [ax1, ay1, ax2, ay2] = rBoxes[aId];
  const ptsA = regionPolys[aId];
  for (let j = i + 1; j < rIds.length; j++) {
    const bId = rIds[j];
    const [bx1, by1, bx2, by2] = rBoxes[bId];
    if (ax2 + 8 < bx1 || bx2 + 8 < ax1 || ay2 + 8 < by1 || by2 + 8 < ay1) continue;

    const ptsB = regionPolys[bId];
    let touch = false;
    for (let pa = 0; pa < ptsA.length && !touch; pa++) {
      const [x1, y1] = ptsA[pa];
      for (let pb = 0; pb < ptsB.length; pb++) {
        const [x2, y2] = ptsB[pb];
        if (Math.abs(x1 - x2) <= 6.5 && Math.abs(y1 - y2) <= 6.5) {
          touch = true;
          break;
        }
      }
    }
    if (touch) addEdge(aId, bId);
  }
}

const seaLanes = [];
function getComponents() {
  const visited = new Set();
  const comps = [];
  for (const id of rIds) {
    if (visited.has(id)) continue;
    const comp = [];
    const q = [id];
    visited.add(id);
    while (q.length) {
      const cur = q.shift();
      comp.push(cur);
      for (const nxt of regions[cur].adjacentIds) {
        if (!visited.has(nxt)) {
          visited.add(nxt);
          q.push(nxt);
        }
      }
    }
    comps.push(comp);
  }
  return comps.sort((a, b) => b.length - a.length);
}

let comps = getComponents();
while (comps.length > 1) {
  const main = comps[0];
  const other = comps[1];
  let bestDist = Infinity;
  let bestPair = [main[0], other[0]];
  for (const a of other) {
    const [ax, ay] = regions[a].labelPos;
    for (const b of main) {
      const [bx, by] = regions[b].labelPos;
      const d = (ax - bx) ** 2 + (ay - by) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestPair = [b, a];
      }
    }
  }
  addEdge(bestPair[0], bestPair[1]);
  seaLanes.push(bestPair);
  comps = getComponents();
}

const findNearestRegion = (tx, ty) => {
  let best = rIds[0];
  let bestD = Infinity;
  for (const id of rIds) {
    const [x, y] = regions[id].labelPos;
    const d = (x - tx) ** 2 + (y - ty) ** 2;
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
};

const STRATEGIC_BRIDGES = [
  [375, 175, 520, 150],
  [380, 320, 540, 290],
  [120, 110, 1080, 110],
  [210, 220, 1040, 230],
  [650, 220, 650, 240],
];

for (const [x1, y1, x2, y2] of STRATEGIC_BRIDGES) {
  const a = findNearestRegion(x1, y1);
  const b = findNearestRegion(x2, y2);
  if (a !== b) {
    addEdge(a, b);
    seaLanes.push([a, b]);
  }
}

const out = { nations, regions, seaLanes };
fs.writeFileSync(
  path.resolve('src/data/generatedWorld.json'),
  JSON.stringify(out)
);

console.log(
  `Generated ${Object.keys(nations).length} real countries, ${Object.keys(regions).length} organic Voronoi provinces, ${seaLanes.length} sea lanes. JSON KB: ${Math.round(
    fs.statSync(path.resolve('src/data/generatedWorld.json')).size / 1024
  )}`
);
