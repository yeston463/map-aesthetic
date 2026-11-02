#!/usr/bin/env python3
"""Check that cited official documentation still resolves and still supports the claim.

Provider documentation sites are often single-page apps: a removed page can still
answer HTTP 200 with a different article. Reachability alone therefore proves
nothing, so every URL cited by an adapter must be paired with tokens that have to
appear on the page it opens.

Exit codes: 0 every claim holds, 1 a citation is dead or no longer supports its
claim, 2 the network prevented a conclusion. A blocked check is never reported as
a pass.
"""
from __future__ import annotations

import argparse
import re
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / "skills" / "map-aesthetic"
ADAPTERS = SKILL / "references" / "adapters"
USER_AGENT = "map-aesthetic-citation-check (repository link verification)"
SKIP_HOSTS = ("registry.npmjs.org", "github.com/sponsors", "opencollective.com", "tidelift.com",
              "json-schema.org", "127.0.0.1", "github.com/yeston463")
SOFT_NOT_FOUND = ("page not found", "404 not found", "页面不存在", "找不到该页面",
                  "does not exist", "sorry, we could not find", "请求的页面不存在")
LINK = re.compile(r"https?://[^ )\"'`>\]]+")
FENCE = re.compile(r"```[^\n]*\n.*?```", re.DOTALL)

# Each entry is (the statement the adapter makes, the page that must support it, and
# tokens that must still be on that page). Tokens were confirmed present on 2026-11-02.
CLAIMS = (
    ("adapters/amap.md: loader takes an explicit version",
     "https://lbs.amap.com/api/javascript-api-v2/getting-started", ("AMapLoader", "version")),
    ("adapters/amap.md: marker content overrides icon",
     "https://lbs.amap.com/api/javascript-api-v2/guide/amap-marker/custom-marker", ("content", "icon", "Marker")),
    ("adapters/amap.md: basemap theme and content entries",
     "https://lbs.amap.com/api/javascript-api-v2/guide/map/map-style", ("setMapStyle", "mapStyle")),
    ("adapters/amap.md: built-in controls and AMapUI",
     "https://lbs.amap.com/api/javascript-api-v2/guide/overlays/toolbar", ("ToolBar", "addControl")),
    ("adapters/amap.md: setMapStyle/getMapStyle and the bg/point/road/building groups",
     "https://lbs.amap.com/api/maps-javascript-api/reference/amap-map/map",
     ("setMapStyle", "getMapStyle", "getFeatures", "setFeatures", "destroy")),
    ("adapters/amap.md: shape overlays expose style options",
     "https://lbs.amap.com/demo/javascript-api-v2/example/overlayers/overlaygroup", ("Polyline", "Polygon", "OverlayGroup")),
    ("adapters/arcgis.md: SDK entry points and components",
     "https://developers.arcgis.com/javascript/latest/get-started/", ("@arcgis/core", "import")),
    ("adapters/arcgis.md: reactiveUtils watch and whenOnce are disposable",
     "https://developers.arcgis.com/javascript/latest/references/core/core/reactiveUtils/", ("whenOnce", "watch")),
    ("adapters/arcgis.md: SceneView shows one label class per feature",
     "https://developers.arcgis.com/javascript/latest/references/core/layers/FeatureLayer/",
     ("labelingInfo", "labelsVisible", "only support displaying one LabelClass")),
    ("adapters/arcgis.md: MapImageLayer renders server sublayers",
     "https://developers.arcgis.com/javascript/latest/references/core/layers/MapImageLayer/", ("sublayers",)),
    ("adapters/arcgis.md: SceneLayer has its own renderer contract",
     "https://developers.arcgis.com/javascript/latest/references/core/layers/SceneLayer/", ("renderer",)),
    ("adapters/arcgis.md: vector tile style helpers are 2D MapView only",
     "https://developers.arcgis.com/javascript/latest/references/core/layers/VectorTileLayer/",
     ("setPaintProperties", "setLayoutProperties", "loadStyle", "only supported in 2D MapView")),
    ("adapters/arcgis.md: cached TileLayer sublayer properties are read-only, except legend and popup",
     "https://developers.arcgis.com/javascript/latest/references/core/layers/support/Sublayer/",
     ("read-only", "legendEnabled")),
    ("adapters/arcgis.md: view readiness through whenLayerView",
     "https://developers.arcgis.com/javascript/latest/references/core/views/MapView/", ("whenLayerView",)),
    ("adapters/arcgis.md: SceneView carries camera state",
     "https://developers.arcgis.com/javascript/latest/references/core/views/SceneView/", ("camera",)),
    ("adapters/baidu.md: 4.0 marks setMapStyleV2 as outdated and pins compatibility flags",
     "https://lbsyun.baidu.com/docs/jsapi?title=jsapi4%2Fupgrade", ("setMapStyleV2", "setMapStyle", "apiVersion")),
    ("adapters/baidu.md: 4.0 style entry",
     "https://lbsyun.baidu.com/docs/jsapi?title=jsapi4%2Fquickstart%2Fstyle", ("setMapStyle",)),
    ("adapters/baidu.md: GL personalization uses setMapStyleV2",
     "https://lbs.baidu.com/docs/jsapi?title=jspopularGL%2Fguide%2Fcustom", ("setMapStyleV2",)),
    ("adapters/baidu.md: 4.0 loading paths need an AK or proxy",
     "https://lbsyun.baidu.com/docs/jsapi?title=jsapi4%2Fguide%2Fconcepts%2Fload", ("ak", "script")),
    ("adapters/baidu.md: polyline style setters",
     "https://lbsyun.baidu.com/docs/jsapi?title=jsapi4%2Fguide%2Foverlayline%2Fpolyline", ("Polyline", "setStrokeColor")),
    ("adapters/baidu.md: reapply an icon with setIcon",
     "https://lbsyun.baidu.com/docs/jsapi?title=jsapi4%2Fguide%2Foverlaypoint%2Fmarkerstyle", ("setIcon", "Icon")),
    ("adapters/baidu.md: area layers",
     "https://lbs.baidu.com/docs/jsapi?title=jsapi4%2Fguide%2Fvisual%2Fpolygon", ("Polygon",)),
    ("adapters/baidu.md: controls with documented positioning",
     "https://lbs.baidu.com/docs/jsapi?title=jsapi4%2Fguide%2Fmap%2Fcontrol", ("addControl", "NavigationControl")),
    ("adapters/leaflet.md: GeoJSON styling and point handling",
     "https://leafletjs.com/examples/geojson/", ("style", "onEachFeature")),
    ("adapters/leaflet.md: panes stack layer groups",
     "https://leafletjs.com/examples/map-panes/", ("createPane", "pane")),
    ("adapters/leaflet.md: core API covers panes, whenReady and GeoJSON.resetStyle",
     "https://leafletjs.com/reference.html", ("createPane", "whenReady", "resetStyle")),
    ("adapters/leaflet.md: React Leaflet documents which props are mutable",
     "https://react-leaflet.js.org/docs/api-components/", ("Marker", "mutable")),
    ("adapters/mapbox.md: feature state and update cost",
     "https://docs.mapbox.com/help/troubleshooting/mapbox-gl-js-performance/", ("setFeatureState", "performance")),
    ("adapters/mapbox.md: map API exposes setStyle and addLayer",
     "https://docs.mapbox.com/mapbox-gl-js/api/map/", ("setStyle", "addLayer", "isStyleLoaded")),
    ("adapters/mapbox.md: setStyle drops runtime sources and layers; restore on style.load",
     "https://docs.mapbox.com/mapbox-gl-js/example/style-switch/", ("setStyle", "style.load", "are lost")),
    ("adapters/mapbox.md: Standard import id is basemap, updated with setConfigProperty",
     "https://docs.mapbox.com/mapbox-gl-js/guides/styles/set-a-style/", ("basemap", "setConfigProperty")),
    ("adapters/mapbox.md: source and layer manipulation",
     "https://docs.mapbox.com/mapbox-gl-js/guides/styles/work-with-layers/", ("addLayer", "moveLayer")),
    ("adapters/mapbox.md: Standard exposes bottom, middle and top slots",
     "https://docs.mapbox.com/style-spec/reference/slots/", ("bottom", "middle", "top")),
    ("adapters/mapbox.md: react-map-gl wraps the Mapbox Map engine",
     "https://visgl.github.io/react-map-gl/docs/api-reference/mapbox/map", ("Map", "mapbox")),
    ("README: Codex scans .agents/skills for user and repository scope",
     "https://learn.chatgpt.com/docs/build-skills", (".agents/skills", "$HOME/.agents/skills")),
)
CLAIM_URLS = {url for _, url, _ in CLAIMS}


class Text(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)

    def text(self) -> str:
        return re.sub(r"\s+", " ", " ".join(self.parts))


def fetch(url: str, timeout: float) -> tuple[str, str, str]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            parser = Text()
            parser.feed(response.read(3_000_000).decode("utf-8", errors="replace"))
            return str(response.status), parser.text(), ""
    except urllib.error.HTTPError as error:
        return str(error.code), "", ""
    except Exception as error:  # noqa: BLE001 - any transport failure means "not concluded"
        return "", "", f"{type(error).__name__}: {error}"


def fetch_with_retry(url: str, timeout: float, retries: int) -> tuple[str, str, str]:
    """Retry transport failures only. A wrong page or a dead link is a result, not noise."""
    attempt = fetch(url, timeout)
    for _ in range(max(0, retries)):
        if not attempt[2]:
            break
        attempt = fetch(url, timeout)
    return attempt


def citations(paths) -> dict[str, set[str]]:
    cited: dict[str, set[str]] = {}
    for path in paths:
        text = FENCE.sub("", path.read_text(encoding="utf-8"))
        for raw in LINK.findall(text):
            url = raw.rstrip(".,;)]'\"")
            if any(skip in url for skip in SKIP_HOSTS):
                continue
            cited.setdefault(url, set()).add(str(path.relative_to(ROOT)).replace("\\", "/"))
    return cited


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--timeout", type=float, default=25.0)
    parser.add_argument("--retries", type=int, default=1, help="extra attempts after a transport failure")
    parser.add_argument("--offline", action="store_true", help="check the claim table without any network use")
    args = parser.parse_args(argv)

    documents = sorted({*ROOT.glob("*.md"), *SKILL.rglob("*.md"), *(ROOT / "docs").rglob("*.md"),
                        *(ROOT / "evals").rglob("*.md"), *(ROOT / ".github").rglob("*.md")})
    cited = citations(documents)
    adapter_cited = citations(sorted(ADAPTERS.glob("*.md")))

    unclaimed = sorted(set(adapter_cited) - CLAIM_URLS)
    failures = [f"UNCLAIMED  {url} is cited by {', '.join(sorted(adapter_cited[url]))} but has no token set"
                for url in unclaimed]
    for _, url, tokens in CLAIMS:
        if not tokens:
            failures.append(f"EMPTY-CLAIM {url} declares no tokens")

    if args.offline:
        for line in failures:
            print(line, file=sys.stderr)
        print(f"Offline: {len(cited)} cited URLs, {len(CLAIMS)} claims, "
              f"{len(adapter_cited)} adapter citations, {len(failures)} structural failures. No network used.")
        return 1 if failures else 0

    urls = sorted(set(cited) | CLAIM_URLS)
    with ThreadPoolExecutor(max_workers=4) as pool:
        bodies = list(pool.map(lambda url: fetch_with_retry(url, args.timeout, args.retries), urls))
    status_for = dict(zip(urls, bodies))

    blocked: list[str] = []
    for url, (status, text, error) in status_for.items():
        sources = ", ".join(sorted(cited.get(url, {"(claim target only)"})))
        if error:
            attempts = 1 + max(0, args.retries)
            blocked.append(f"BLOCKED    {url} ({error}) after {attempts} attempt(s), cited by {sources}")
        elif not status.startswith("2"):
            failures.append(f"DEAD       {url} -> HTTP {status} cited by {sources}")
        elif any(marker in text.lower() for marker in SOFT_NOT_FOUND):
            failures.append(f"SOFT-404   {url} -> HTTP {status} renders a not-found page, cited by {sources}")

    for label, url, tokens in CLAIMS:
        status, text, error = status_for[url]
        if error:
            continue
        missing = [token for token in tokens if token.lower() not in text.lower()]
        if missing:
            failures.append(f"UNSUPPORTED {label}\n            {url}\n            missing: {', '.join(missing)}")

    for line in failures + blocked:
        print(line, file=sys.stderr)
    reachability_only = sorted(set(cited) - CLAIM_URLS)
    print(f"Checked {len(urls)} URLs and {len(CLAIMS)} claims: {len(failures)} failures, {len(blocked)} blocked; "
          f"{len(reachability_only)} non-adapter citations were checked for reachability only.")
    if blocked:
        print("Blocked checks are not passes; report them as unverified.", file=sys.stderr)
        return 2
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
