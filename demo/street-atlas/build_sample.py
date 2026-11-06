"""Build a local, openly attributed street backdrop and fictional delivery example.

The preserved Overpass response is the only source of real geometry. Site coordinates and
the example route are generated from it; they do not describe real deliveries or businesses.
Requires networkx only when regenerating the sample.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from hashlib import sha256
from math import hypot
from pathlib import Path
import json

import networkx as nx

HERE = Path(__file__).resolve().parent
DATA = HERE / 'data'
RAW = DATA / 'osm-overpass.json'
SURROUNDINGS = DATA / 'osm-surroundings.json'
ORIGINAL_SITES = HERE.parent / 'three-directions' / 'data' / 'sites.geojson'
SOURCE_BOUNDS = [31.216, 121.425, 31.238, 121.452]
SURROUNDING_BOUNDS = [31.205, 121.405, 31.248, 121.470]
ROUTE_SITES = ['S01', 'S10', 'S02', 'S03', 'S04', 'S05', 'S09']
ROAD_CLASSES = {'primary', 'secondary', 'tertiary', 'residential', 'living_street', 'unclassified', 'service'}


def save(name, value):
    (DATA / name).write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')


def feature(kind, geometry_type, coordinates, **properties):
    return {'type': 'Feature', 'properties': {'kind': kind, **properties},
            'geometry': {'type': geometry_type, 'coordinates': coordinates}}


raw = RAW.read_bytes()
source = json.loads(raw)
surroundings_raw = SURROUNDINGS.read_bytes()
surroundings = json.loads(surroundings_raw)
unique_elements = {}
for item in source['elements'] + surroundings['elements']:
    unique_elements.setdefault((item['type'], item['id']), item)
context = []
roads_by_name = defaultdict(list)
graph = nx.Graph()
for item in unique_elements.values():
    tags = item.get('tags', {})
    points = [[round(p['lon'], 6), round(p['lat'], 6)] for p in item.get('geometry', [])]
    if len(points) < 2:
        continue
    highway = tags.get('highway')
    if highway in ROAD_CLASSES or highway in {'pedestrian', 'footway'}:
        kind = 'major-road' if highway in {'primary', 'secondary', 'tertiary'} else 'minor-road'
        context.append(feature(kind, 'LineString', points, osm_id=item['id'], highway=highway))
        if tags.get('name') and highway in ROAD_CLASSES:
            length = sum(hypot((a[0] - b[0]) * .854, a[1] - b[1]) for a, b in zip(points, points[1:]))
            roads_by_name[tags['name']].append((length, points, highway))
        if highway in ROAD_CLASSES:
            for a, b in zip(points, points[1:]):
                aa, bb = tuple(a), tuple(b)
                if aa != bb:
                    graph.add_edge(aa, bb, weight=hypot((aa[0] - bb[0]) * .854, aa[1] - bb[1]))
    elif len(points) >= 4 and points[0] == points[-1]:
        kind = ('building' if tags.get('building') else
                'water' if tags.get('natural') == 'water' else
                'park' if tags.get('leisure') == 'park' or tags.get('landuse') in {'grass', 'forest', 'recreation_ground'}
                else None)
        if kind:
            context.append(feature(kind, 'Polygon', [points], osm_id=item['id']))

largest = max(nx.connected_components(graph), key=len)
graph = graph.subgraph(largest)
sites = json.loads(ORIGINAL_SITES.read_text(encoding='utf-8'))
selected = {}
for item in sites['features']:
    x, y = item['geometry']['coordinates']
    snap = min(graph, key=lambda point: ((point[0] - x) * .854) ** 2 + (point[1] - y) ** 2)
    item['geometry']['coordinates'] = list(snap)
    selected[item['properties']['site_id']] = snap

route_points = []
for start, end in zip(ROUTE_SITES, ROUTE_SITES[1:]):
    part = nx.shortest_path(graph, selected[start], selected[end], weight='weight')
    route_points.extend(part if not route_points else part[1:])
route = {'type': 'FeatureCollection', 'features': [feature('example-route', 'LineString', route_points)]}

named_roads = []
for name, segments in roads_by_name.items():
    length, coords, road_class = max(segments, key=lambda part: part[0])
    named_roads.append((length, feature('road-label', 'Point', coords[len(coords) // 2], name=name, highway=road_class)))
named_roads.sort(key=lambda item: item[0], reverse=True)
save('context.geojson', {'type': 'FeatureCollection', 'features': context})
save('sites.geojson', sites)
save('route.geojson', route)
save('labels.geojson', {'type': 'FeatureCollection', 'features': [item[1] for item in named_roads[:40]]})
save('provenance.json', {
    'source': 'OpenStreetMap contributors, via Overpass API',
    'source_url': 'https://www.openstreetmap.org/copyright',
    'api_url': 'https://overpass-api.de/api/interpreter',
    'source_bounds_south_west_north_east': SOURCE_BOUNDS,
    'source_timestamp_utc': source.get('osm3s', {}).get('timestamp_osm_base'),
    'source_sha256': sha256(raw).hexdigest(),
    'surrounding_bounds_south_west_north_east': SURROUNDING_BOUNDS,
    'surrounding_timestamp_utc': surroundings.get('osm3s', {}).get('timestamp_osm_base'),
    'surrounding_sha256': sha256(surroundings_raw).hexdigest(),
    'built_at_utc': datetime.now(timezone.utc).isoformat(),
    'license': 'ODbL-1.0',
    'description': 'The basemap uses OSM geometry. Sites and the route are fictional, moved onto the sampled road graph for visual demonstration; route ignores real traffic restrictions and must not be used for navigation.',
})
print(f'context={len(context)} roads_with_names={len(named_roads)} sites={len(sites["features"])} route_vertices={len(route_points)}')
