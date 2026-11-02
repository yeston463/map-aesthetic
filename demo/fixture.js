// Original synthetic geometry in a Cartesian plane; one local unit represents one synthetic meter.
// Arrays use Leaflet's [y, x] order. No real place or external geographic dataset is represented.
export const center = [5300, 7200];
export const views = { overview: -5, working: -4, detail: -2.5 };
export const sites = [
  { id: 'west-hub', name: 'West Hub', point: [4300, 3000], kind: 'Dispatch', note: 'Start of the synthetic service route.' },
  { id: 'garden-stop', name: 'Garden Stop', point: [6200, 6200], kind: 'Collection', note: 'A stop beside the generated civic garden.' },
  { id: 'river-depot', name: 'River Depot', point: [4300, 9300], kind: 'Transfer', note: 'A route stop near the synthetic river crossing.' },
  { id: 'east-terminal', name: 'East Terminal', point: [6200, 11800], kind: 'Arrival', note: 'End of the synthetic service route.' },
];
export const route = [[4300, 3000], [4300, 4200], [6200, 4200], [6200, 6200], [6200, 7900], [4300, 7900], [4300, 9300], [4300, 11800], [6200, 11800]];
export const river = [
  [11500, 6800], [10000, 7200], [8500, 7300], [7300, 7900], [6100, 8500], [5000, 8500],
  [3900, 8100], [2700, 8600], [1300, 9200], [-1000, 9600], [-1000, 10400], [1300, 10000],
  [2700, 9400], [3900, 9000], [5000, 9300], [6100, 9300], [7300, 8700], [8500, 8100],
  [10000, 8000], [11500, 7600],
];
export const parks = [
  [[6800, 4500], [8000, 4500], [8500, 5100], [8200, 6400], [6900, 6500]],
  [[1400, 10400], [3100, 10100], [3500, 11200], [3000, 12800], [1700, 13000]],
  [[7200, 10500], [8000, 10700], [8300, 12200], [7100, 12800]],
];
export const roads = [
  { major: true, points: [[-1000, 4200], [11500, 4200]] },
  { major: true, points: [[4300, -1500], [4300, 16000]] },
  { major: true, points: [[6200, -1500], [6200, 16000]] },
  { major: true, points: [[-1000, 11800], [11500, 11800]] },
  ...[2400, 4500, 8300, 9900].map(y => ({ points: [[y, -1500], [y, 16000]] })),
  ...[1500, 3000, 6200, 10100, 13700].map(x => ({ points: [[-1000, x], [11500, x]] })),
  { points: [[-1000, 2000], [11000, 14200]], diagonal: true },
];
export const buildings = [];
for (let y = 1300; y < 10000; y += 950) {
  for (let x = 900; x < 14500; x += 1100) {
    if ((x > 6500 && x < 9800) || (y > 6500 && x > 4200 && x < 6700)) continue;
    buildings.push([[y + 120, x + 120], [y + 570, x + 120], [y + 570, x + 720], [y + 120, x + 720]]);
  }
}
export const labels = [
  { name: 'WEST QUARTER', point: [7300, 2300], priority: 0, district: true },
  { name: 'RIVER QUARTER', point: [9000, 10200], priority: 0, district: true },
  { name: 'SOUTH COMMON', point: [2300, 5100], priority: 0, district: true },
  { name: 'Civic Garden', point: [7560, 5450], priority: 1 },
  { name: 'Riverside Park', point: [2300, 11500], priority: 1 },
  { name: 'Canal Street', point: [4670, 5600], priority: 2 },
  { name: 'Pine Avenue', point: [6580, 10500], priority: 2 },
  { name: 'North Walk', point: [8600, 5050], priority: 2 },
  { name: 'Meadow Court', point: [3200, 2900], priority: 2 },
  { name: 'Garden Lane', point: [5800, 6900], priority: 2 },
  { name: 'Orchard Court', point: [5100, 6500], priority: 2 },
  { name: 'Canal Bridge', point: [4600, 7900], priority: 2 },
  ...sites.map(site => ({ name: site.name, point: [site.point[0] + 220, site.point[1]], priority: 1, siteId: site.id })),
];
