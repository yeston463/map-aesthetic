"""Build the multi-line street operations scene.

Reads the preserved OSM street snapshot (same sources as demo/street-atlas), rebuilds
the road graph, then derives:
- `data/zones.geojson`  4 zone polygons, each the convex hull of the road-nodes
                        closest to one of four anchors. Their titles/labels are fictional;
                        the polygon geometry is real OSM geometry.
- `data/routes.geojson` three fictional routes; the path is a shortest path along the
                        real road graph between fictional stops, ignoring one-way rules.
- `data/sites.geojson`  12 stops, same as street-atlas, extended with per-slot status
                        and throughput (fictional).
- `data/slots.json`     per-timeslot active route list.
- `data/provenance.json` original OSM snapshot record plus the fictional-import note.

Run from the project root via `python demo/street-atlas-scene/build_scene.py`.
Requires networkx and shapely; writes only files inside this folder.
"""
from __future__ import annotations

from collections import defaultdict
from hashlib import sha256
from math import hypot
from pathlib import Path
import json
import networkx as nx
from shapely.geometry import MultiPoint, Polygon

HERE = Path(__file__).resolve().parent
DATA = HERE / 'data'
SOURCE = HERE.parent / 'street-atlas' / 'data' / 'osm-overpass.json'
SITING = HERE.parent / 'street-atlas' / 'data' / 'sites.geojson'

ROAD_CLASSES = {'primary', 'secondary', 'tertiary', 'residential', 'living_street', 'unclassified', 'service'}


def save(name, value):
    DATA.mkdir(exist_ok=True)
    (DATA / name).write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')


# Route specs (fictional): stop ids and the order they are visited on that route.
ROUTE_SPECS = {
    'R-01': ['S03', 'S04', 'S05', 'S09'],
    'R-02': ['S12', 'S08', 'S04', 'S01', 'S07', 'S11'],
    'R-03': ['S11', 'S02', 'S12', 'S06', 'S05', 'S10'],
}
ZONE_SPECS = {
    'Z-01': ('三里坊', '居住坊块', [121.4275, 31.2255], '#8ea395'),
    'Z-02': ('梅陇园区', '文化园区', [121.4475, 31.2245], '#7fa6a7'),
    'Z-03': ('长途客运站街区', '通勤街区', [121.4295, 31.2196], '#88989c'),
    'Z-04': ('滨江大道', '运动街区', [121.4475, 31.2186], '#ab9a86'),
}
# Per-timeslot: which routes are on duty, per-route alerts, per-site throughput.
SITES_BASE = []
for _ENTRY in json.loads(SITING.read_text(encoding='utf-8'))['features']:
    SITES_BASE.append({'site_id': _ENTRY['properties']['site_id'], 'throughput': _ENTRY['properties']['throughput']})

# Hand-authored status per site per slot. Fictional, keeps the sheet focused on hierarchy.
SITE_STATUS = {
    'early': {'S03': 'alert', 'S11': 'alert', 'S04': 'pending', 'S09': 'pending'},
    'mid':   {'S07': 'alert', 'S03': 'pending', 'S11': 'alert'},
    'late':  {'S05': 'pending', 'S09': 'pending', 'S02': 'alert', 'S10': 'alert'},
}

SLOTS = {
    'early': {
        'label': '早班', 'window': '07:00–11:00',
        'routes': ['R-01', 'R-03'],
        'theme': 'strong',
        'throughputs': {s['site_id']: round(s['throughput'] * (0.9 if i % 3 else 1.1)) for i, s in enumerate(SITES_BASE)},
        'alerts': ['S03', 'S11'],
        'route_status': {'R-01': 'normal', 'R-03': 'alert'},
        'site_status': SITE_STATUS['early'],
    },
    'mid': {
        'label': '午班', 'window': '11:00–16:00',
        'routes': ['R-02', 'R-03'],
        'theme': 'both',
        'throughputs': {s['site_id']: round(s['throughput'] * 1.2) for s in SITES_BASE},
        'alerts': ['S07'],
        'route_status': {'R-02': 'normal', 'R-03': 'normal'},
        'site_status': SITE_STATUS['mid'],
    },
    'late': {
        'label': '晚班', 'window': '16:00–22:00',
        'routes': ['R-01', 'R-02', 'R-03'],
        'theme': 'third',
        'throughputs': {s['site_id']: round(s['throughput'] * 0.6) for s in SITES_BASE},
        'alerts': ['S05', 'S09'],
        'route_status': {'R-01': 'normal', 'R-02': 'normal', 'R-03': 'alert'},
        'site_status': SITE_STATUS['late'],
    },
}


def build_graph(elements) -> nx.Graph:
    graph = nx.Graph()
    for item in elements:
        tags = item.get('tags', {})
        points = [[round(p['lon'], 6), round(p['lat'], 6)] for p in item.get('geometry', [])]
        highway = tags.get('highway')
        if highway not in ROAD_CLASSES or len(points) < 4:
            continue
        for a, b in zip(points, points[1:]):
            aa, bb = tuple(a), tuple(b)
            if aa == bb:
                continue
            graph.add_edge(aa, bb, weight=hypot((aa[0] - bb[0]) * .854, aa[1] - bb[1]))
    return graph


def convex_hull_polygon(points) -> list:
    hull = MultiPoint(points).convex_hull
    if isinstance(hull, Polygon):
        coords = list(hull.exterior.coords)
    else:  # a hull could be a line; normalize to a tiny polygon.
        coords = [(pt[0] + 1e-5, pt[1]), (pt[0] - 1e-5, pt[1]), (pt[0], pt[1] + 1e-5)] if isinstance(hull, geom_type := hull) else []
    return [[round(x, 6), round(y, 6)] for x, y in coords]


ZONE_RADIUS_X = .0075  # 640 m of latitude-equivalent spread; keeps zones local instead of a map-wide wash
ZONE_RADIUS_Y = .0065


def zone_node_index(nodes, anchors):
    """Group nodes into a zone blob around each anchor; stray nodes stay outside."""
    zone_index = defaultdict(list)
    for point in nodes:
        for zone_id, anchor in anchors.items():
            dx = (point[0] - anchor[0]) * .854
            dy = point[1] - anchor[1]
            if hypot(dx, dy) <= hypot(ZONE_RADIUS_X, ZONE_RADIUS_Y):
                zone_index[zone_id].append(point)
                break
    return zone_index


def assign_zone(point, anchors) -> str:
    def cost(zone_id):
        anchor = anchors[zone_id]
        return hypot((point[0] - anchor[0]) * .854, point[1] - anchor[1])
    return min(ZONE_SPECS, key=cost)


def main() -> None:
    raw = SOURCE.read_bytes()
    source = json.loads(raw)
    graph = build_graph(source['elements'])
    if not graph.nodes:
        raise RuntimeError('no road graph could be built from the snapshot')

    largest = max(nx.connected_components(graph), key=len)
    graph = graph.subgraph(largest)
    anchors = {zone_id: spec[2] for zone_id, spec in ZONE_SPECS.items()}

    # The 12 stops reuse street-atlas's snapped coordinates, so route paths ride the same graph.
    sites = json.loads(SITING.read_text(encoding='utf-8'))
    site_features = sites['features']
    def snap(lon, lat):
        return min(graph.nodes, key=lambda p: ((p[0] - lon) * .854) ** 2 + (p[1] - lat) ** 2)
    node_by_site = {feature['properties']['site_id']: snap(*feature['geometry']['coordinates']) for feature in site_features}

    routes = []
    for route_id, stops in ROUTE_SPECS.items():
        chain = []
        for earlier, later in zip(stops, stops[1:]):
            path = nx.shortest_path(graph, node_by_site[earlier], node_by_site[later], weight='weight')
            chain.extend(path if not chain else path[1:])
        routes.append(feature(route_id, 'LineString', chain, {'route_id': route_id, 'stops': stops}))

    zone_indices = zone_node_index(list(graph.nodes), anchors)

    def zone_feature(zone_id) -> dict:
        name, role, anchor, color = ZONE_SPECS[zone_id]
        return feature(zone_id, 'Polygon', [convex_hull_polygon(zone_indices[zone_id])], {
            'zone_id': zone_id, 'name': name, 'role': role, 'anchor': anchor, 'accent': color,
        })

    zones = [feature(zid, 'Polygon', None, None) for zid in ()]
    zones = [zone_feature(zone_id) for zone_id in ZONE_SPECS]

    slots_payload = {slot: {
        'label': config['label'], 'window': config['window'],
        'routes': config['routes'],
        'alerts': config['alerts'],
        'throughputs': config['throughputs'],
        'route_status': config['route_status'],
        'site_status': SITE_STATUS[slot],
    } for slot, config in SLOTS.items()}

    save('zones.geojson', {'type': 'FeatureCollection', 'features': zones})
    save('routes.geojson', {'type': 'FeatureCollection', 'features': routes})
    save('slots.json', slots_payload)
    save('provenance.json', {
        'source': 'OpenStreetMap contributors, via Overpass API',
        'source_url': 'https://www.openstreetmap.org/copyright',
        'api_url': 'https://overpass-api.de/api/interpreter',
        'source_bounds_south_west_north_east': [31.205, 121.405, 31.248, 121.470],
        'source_timestamp_utc': source.get('osm3s', {}).get('timestamp_osm_base'),
        'source_sha256': sha256(raw).hexdigest(),
        'licence': 'ODbL-1.0',
        'road_graph_edges': graph.number_of_edges(),
        'road_graph_nodes': graph.number_of_nodes(),
        'zone_count': len(zones),
        'fictional_layers': ['zones (names/labels)', 'routes (paths + stops + throughput)'],
        'note': 'Zone polygons are convex hulls of the OSM road-nodes nearest to four hand-picked anchors, so the outline is real geometry with a fictional label. Routes and their stops/loads are fictional and must not be used for navigation.',
    })
    print(f'routes={len(routes)} zones={len(zones)} route edges={graph.number_of_edges()}')


def feature(kind, geometry_type, coordinates, properties) -> dict:
    return {'type': 'Feature',
            'properties': {'kind': kind, **(properties or {})},
            'geometry': ({'type': geometry_type, 'coordinates': coordinates} if coordinates else None)}


if __name__ == '__main__':
    main()
