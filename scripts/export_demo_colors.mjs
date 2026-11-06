// Export the colours actually used by the three-direction demo as JSON.
// The measurement script reads this rather than duplicating hex values, so a
// palette edit cannot leave the CIEDE2000 report describing an old palette.
//
//   node scripts/export_demo_colors.mjs > output/demo-colors.json

const IDS = ['light-operations', 'warm-city-guide', 'dark-monitoring'];
const result = {};

for (const id of IDS) {
  const style = await import(`../demo/three-directions/styles/${id}.js`);
  const context = { classCounts: [0, 0, 0, 0], missingCount: 0, classCount: 4 };
  const entries = style.legend.entries('absolute', context);
  const categorical = [...new Set(entries
    .filter(entry => entry.kind === 'dot' || entry.kind === 'ring')
    .map(entry => entry.color).filter(Boolean))];
  result[id] = {
    variant: style.variant,
    label: style.label,
    basemap: {
      land: style.basemap.background,
      water: style.basemap.water.fillColor,
      park: style.basemap.blocks.fillColor,
      roadCasing: style.basemap.roads.arterial.casingColor,
      road: style.basemap.roads.arterial.coreColor,
    },
    sequential: style.districts.ramp,
    diverging: style.districts.deviation.ramp,
    categorical,
    missing: style.districts.missing.fillColor,
    boundary: style.districts.boundary.color,
    route: style.route.color,
    fillOpacity: style.districts.fillOpacity,
    ui: style.ui,
  };
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
