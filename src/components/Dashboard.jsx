import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import "leaflet/dist/leaflet.css";
import bayblazeBackground from "../../functions/assets/bayblaze-background.png";
import { auth } from "../firebase";
import "./Dashboard.css";

const CHART_LIMIT = 8;
const EMPTY_LABEL = "Unspecified";
const DASHBOARD_DATA_URL =
  "https://us-central1-bayblaze-sweepstakes.cloudfunctions.net/getDashboardData";
const ZCTA_QUERY_URL =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2025/MapServer/2/query";

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function addCount(counts, value) {
  const cleaned = cleanString(value);

  if (!cleaned) {
    return;
  }

  const key = cleaned.toLowerCase();
  const current = counts.get(key) || { label: cleaned, count: 0 };
  current.count += 1;
  counts.set(key, current);
}

function rowsFromCounts(counts) {
  return [...counts.values()].sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return left.label.localeCompare(right.label);
  });
}

function countResponseField(responses, fieldNames) {
  const counts = new Map();

  responses.forEach((response) => {
    const value = fieldNames
      .map((fieldName) => cleanString(response[fieldName]))
      .find(Boolean);
    addCount(counts, value);
  });

  return rowsFromCounts(counts);
}

function countArrayField(responses, fieldName) {
  const counts = new Map();

  responses.forEach((response) => {
    const values = Array.isArray(response[fieldName]) ? response[fieldName] : [];
    values.forEach((value) => addCount(counts, value));
  });

  return rowsFromCounts(counts);
}

function normalizeZipCode(value) {
  const cleaned = cleanString(value);
  const match = cleaned.match(/\d{5}/);
  return match ? match[0] : cleaned;
}

function countZipCodes(responses) {
  const counts = new Map();

  responses.forEach((response) => {
    addCount(counts, normalizeZipCode(response.zipCode));
  });

  return rowsFromCounts(counts);
}

function escapeHtml(value) {
  return cleanString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatEntryId(path) {
  const cleaned = cleanString(path);
  return cleaned.split("/").pop() || "No entry linked";
}

function buildZipDetails(responses, entries) {
  const entryByPath = new Map();
  const entryByEmail = new Map();

  entries.forEach((entry) => {
    const path = entry.__path || `sweepstakes_entries/${entry.id}`;
    const email = cleanString(entry.email).toLowerCase();

    entryByPath.set(path, entry);

    if (email) {
      entryByEmail.set(email, entry);
    }
  });

  const zipDetails = new Map();

  responses.forEach((response) => {
    const zipCode = normalizeZipCode(response.zipCode);

    if (!zipCode) {
      return;
    }

    const email = cleanString(response.email);
    const entryPath = getReferencePath(response.entry);
    const entry =
      entryByPath.get(entryPath) ||
      entryByEmail.get(email.toLowerCase()) ||
      null;
    const resolvedEntryPath =
      entry?.__path ||
      entryPath ||
      (entry?.id ? `sweepstakes_entries/${entry.id}` : "");

    if (!zipDetails.has(zipCode)) {
      zipDetails.set(zipCode, {
        count: 0,
        responses: [],
        zipCode,
      });
    }

    const detail = zipDetails.get(zipCode);
    detail.count += 1;
    detail.responses.push({
      email: email || "No email",
      entryPath: resolvedEntryPath,
      responseId: response.id,
      submittedAt: response.submittedAt,
    });
  });

  return zipDetails;
}

function buildZctaQueryUrl(zipCodes) {
  const whereClause = `GEOID IN (${zipCodes
    .map((zipCode) => `'${zipCode.replace(/'/g, "''")}'`)
    .join(",")})`;
  const params = new URLSearchParams({
    f: "geojson",
    outFields: "GEOID,BASENAME,INTPTLAT,INTPTLON",
    outSR: "4326",
    returnGeometry: "true",
    where: whereClause,
  });

  return `${ZCTA_QUERY_URL}?${params.toString()}`;
}

function buildZipPopupHtml(zipCode, detail) {
  const responseItems = detail.responses
    .slice()
    .sort((left, right) => left.email.localeCompare(right.email))
    .map((response) => {
      const entryLabel = response.entryPath ?
        formatEntryId(response.entryPath) :
        "No linked entry";

      return `
        <li>
          <strong>${escapeHtml(response.email)}</strong>
          <span>Entry: ${escapeHtml(entryLabel)}</span>
        </li>
      `;
    })
    .join("");

  return `
    <section class="zip-popup-content">
      <h3>${escapeHtml(zipCode)}</h3>
      <p>${detail.count} respondent${detail.count === 1 ? "" : "s"}</p>
      <ul>${responseItems}</ul>
    </section>
  `;
}

function getEntryPath(entry) {
  return entry.__path || (entry.id ? `sweepstakes_entries/${entry.id}` : "");
}

function buildVerifiedResponseSet(responses, entries) {
  const verifiedEntryPaths = new Set();
  const verifiedEntryEmails = new Set();

  entries.forEach((entry) => {
    if (entry.emailVerified !== true) {
      return;
    }

    const path = getEntryPath(entry);
    const email = cleanString(entry.email).toLowerCase();

    if (path) {
      verifiedEntryPaths.add(path);
    }

    if (email) {
      verifiedEntryEmails.add(email);
    }
  });

  return responses.filter((response) => {
    const entryPath = getReferencePath(response.entry);
    const email = cleanString(response.email).toLowerCase();

    return (
      (entryPath && verifiedEntryPaths.has(entryPath)) ||
      (email && verifiedEntryEmails.has(email))
    );
  });
}

function getTimestampMillis(value) {
  if (value && typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (value && typeof value.seconds === "number") {
    return value.seconds * 1000;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function formatDate(value) {
  const millis = getTimestampMillis(value);

  if (!millis) {
    return "No submissions yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(millis));
}

function formatPercent(count, total) {
  if (!total) {
    return "0%";
  }

  return `${Math.round((count / total) * 100)}%`;
}

function formatEntryLabel(path, entry) {
  const rawLabel = cleanString(entry?.email) || path.split("/").pop() || "Entry";

  if (!rawLabel.includes("@")) {
    return rawLabel.length > 18 ? `${rawLabel.slice(0, 16)}...` : rawLabel;
  }

  const [name, domain = ""] = rawLabel.split("@");
  const shortName = name.length > 12 ? `${name.slice(0, 12)}...` : name;
  const shortDomain = domain.split(".")[0] || domain;
  return `${shortName}@${shortDomain}`;
}

function getReferencePath(value) {
  if (value && typeof value.path === "string") {
    return value.path;
  }

  if (typeof value === "string" && value.includes("/")) {
    return value;
  }

  return "";
}

function countDescendants(path, adjacency) {
  const seen = new Set();
  const queue = [...(adjacency.get(path) || [])];

  while (queue.length) {
    const current = queue.shift();

    if (!current || seen.has(current)) {
      continue;
    }

    seen.add(current);
    queue.push(...(adjacency.get(current) || []));
  }

  return seen.size;
}

function buildReferralGraph(entries) {
  const nodes = new Map();
  const adjacency = new Map();
  const incoming = new Set();
  const edgeKeys = new Set();

  entries.forEach((entry) => {
    const path = entry.__path || `sweepstakes_entries/${entry.id}`;
    nodes.set(path, {
      path,
      entry,
      label: formatEntryLabel(path, entry),
    });
  });

  const addEdge = (parentPath, childPath) => {
    if (!parentPath || !childPath || parentPath === childPath) {
      return;
    }

    const edgeKey = `${parentPath}->${childPath}`;

    if (edgeKeys.has(edgeKey)) {
      return;
    }

    edgeKeys.add(edgeKey);

    if (!adjacency.has(parentPath)) {
      adjacency.set(parentPath, []);
    }

    adjacency.get(parentPath).push(childPath);
    incoming.add(childPath);

    if (!nodes.has(parentPath)) {
      nodes.set(parentPath, {
        path: parentPath,
        entry: null,
        label: formatEntryLabel(parentPath, null),
      });
    }

    if (!nodes.has(childPath)) {
      nodes.set(childPath, {
        path: childPath,
        entry: null,
        label: formatEntryLabel(childPath, null),
      });
    }
  };

  entries.forEach((entry) => {
    const entryPath = entry.__path || `sweepstakes_entries/${entry.id}`;
    addEdge(getReferencePath(entry.referredBy), entryPath);

    if (Array.isArray(entry.referrals)) {
      entry.referrals.forEach((referral) => {
        addEdge(entryPath, getReferencePath(referral));
      });
    }
  });

  const topParents = [...adjacency.entries()]
    .map(([path, children]) => ({
      path,
      directCount: children.length,
      totalCount: countDescendants(path, adjacency),
    }))
    .filter((parent) => parent.directCount > 0)
    .sort((left, right) => {
      if (right.totalCount !== left.totalCount) {
        return right.totalCount - left.totalCount;
      }

      return right.directCount - left.directCount;
    })
    .slice(0, 5);

  return {
    adjacency,
    edgeCount: edgeKeys.size,
    incomingCount: incoming.size,
    nodes,
    topParents,
  };
}

function buildAnalytics(responses, entries, rawResponseCount) {
  const latestResponse = responses.reduce((latest, response) => {
    return getTimestampMillis(response.submittedAt) >
      getTimestampMillis(latest?.submittedAt) ?
      response :
      latest;
  }, null);

  return {
    completedEntries: entries.filter((entry) => entry.used === true).length,
    entriesTotal: entries.length,
    excludedResponses: Math.max(0, rawResponseCount - responses.length),
    latestSubmission: formatDate(latestResponse?.submittedAt),
    referralGraph: buildReferralGraph(entries),
    responsesTotal: responses.length,
    smokeShopProducts: countArrayField(responses, "smokeShopProducts"),
    verifiedEntries: entries.filter((entry) => entry.emailVerified === true).length,
    vapeBrands: countResponseField(responses, ["favoriteVapeBrand"]),
    vapeFlavors: countResponseField(responses, ["favoriteVapeFlavor"]),
    cigaretteBrands: countResponseField(responses, [
      "favoriteCigaretteBrand",
      "favoriteCigarette",
      "cigaretteBrand",
    ]),
    zipCodes: countZipCodes(responses),
  };
}

function layoutReferralGraph(graph) {
  const nodes = [];
  const edges = [];
  let cursor = 36;

  graph.topParents.forEach((parent) => {
    const children = (graph.adjacency.get(parent.path) || []).slice(0, 5);
    const childSlots = Math.max(children.length, 1);
    const groupHeight = childSlots * 76;
    const rootY = cursor + groupHeight / 2;
    const parentNode = graph.nodes.get(parent.path);

    nodes.push({
      count: parent.directCount,
      depth: 0,
      key: parent.path,
      label: parentNode?.label || formatEntryLabel(parent.path, null),
      path: parent.path,
      title: parent.path,
      x: 13,
      y: rootY,
    });

    children.forEach((childPath, childIndex) => {
      const childY = cursor + childIndex * 76 + 38;
      const childNode = graph.nodes.get(childPath);
      const grandchildren = (graph.adjacency.get(childPath) || []).slice(0, 2);
      const grandchildCount = graph.adjacency.get(childPath)?.length || 0;

      edges.push({
        key: `${parent.path}-${childPath}`,
        x1: 24,
        x2: 47,
        y1: rootY,
        y2: childY,
      });

      nodes.push({
        count: grandchildCount,
        depth: 1,
        key: `${parent.path}-${childPath}`,
        label: childNode?.label || formatEntryLabel(childPath, null),
        path: childPath,
        title: childPath,
        x: 51,
        y: childY,
      });

      grandchildren.forEach((grandchildPath, grandchildIndex) => {
        const grandchildY =
          childY + (grandchildIndex - (grandchildren.length - 1) / 2) * 28;
        const grandchildNode = graph.nodes.get(grandchildPath);

        edges.push({
          key: `${childPath}-${grandchildPath}`,
          x1: 63,
          x2: 78,
          y1: childY,
          y2: grandchildY,
        });

        nodes.push({
          count: graph.adjacency.get(grandchildPath)?.length || 0,
          depth: 2,
          key: `${childPath}-${grandchildPath}`,
          label: grandchildNode?.label || formatEntryLabel(grandchildPath, null),
          path: grandchildPath,
          title: grandchildPath,
          x: 84,
          y: grandchildY,
        });
      });

      if (grandchildCount > grandchildren.length) {
        nodes.push({
          count: 0,
          depth: 3,
          key: `${childPath}-extra`,
          label: `+${grandchildCount - grandchildren.length}`,
          path: childPath,
          title: `${grandchildCount - grandchildren.length} more referrals`,
          x: 94,
          y: childY,
        });
      }
    });

    cursor += groupHeight + 40;
  });

  return {
    edges,
    height: Math.max(300, cursor + 24),
    nodes,
  };
}

function getDashboardSignInErrorMessage(error) {
  if (error?.code === "auth/configuration-not-found") {
    return "Firebase Authentication is not enabled for this project yet. In Firebase Console, enable Authentication and turn on the Email/Password sign-in provider.";
  }

  if (error?.code === "auth/invalid-credential") {
    return "Those dashboard credentials did not match a Firebase Auth user.";
  }

  if (error?.code === "auth/too-many-requests") {
    return "Too many sign-in attempts. Wait a bit, then try again.";
  }

  return error?.message || "Could not sign in.";
}

function DashboardLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error) {
      setErrorMessage(getDashboardSignInErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      className="dashboard-shell dashboard-login-shell"
      style={{ "--app-shell-background": `url(${bayblazeBackground})` }}
    >
      <form className="dashboard-login-card" onSubmit={handleSubmit}>
        <p className="dashboard-eyebrow">BAYBLAZE Dashboard</p>
        <h1>Login</h1>

        <label>
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
        </label>

        <label>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Enter Dashboard"}
        </button>

        {errorMessage && <p className="dashboard-error">{errorMessage}</p>}
      </form>
    </main>
  );
}

function MetricCard({ label, value, detail }) {
  return (
    <section className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </section>
  );
}

function BarChartBlock({ title, rows, total }) {
  const visibleRows = rows.slice(0, CHART_LIMIT);
  const maxCount = visibleRows[0]?.count || 0;

  return (
    <div className="bar-chart-block">
      <div className="bar-chart-block-heading">
        <h3>{title}</h3>
      </div>

      {visibleRows.length ? (
        <div className="bar-chart">
          {visibleRows.map((row) => (
            <div className="bar-row" key={row.label}>
              <div className="bar-row-label">
                <span>{row.label}</span>
                <strong>{row.count}</strong>
              </div>
              <div className="bar-track" aria-hidden="true">
                <div
                  className="bar-fill"
                  style={{
                    "--bar-width": `${Math.max(
                      8,
                      (row.count / maxCount) * 100
                    )}%`,
                  }}
                />
              </div>
              <small>{formatPercent(row.count, total)}</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-state">No data captured yet.</p>
      )}
    </div>
  );
}

function PreferenceTabsWidget({ analytics }) {
  const [activeTab, setActiveTab] = useState("favorites");
  const [activeFavoriteTab, setActiveFavoriteTab] = useState("brand");

  return (
    <section className="dashboard-widget preference-widget">
      <div className="widget-heading preference-heading">
        <div>
          <h2>Survey Preferences</h2>
        </div>
        <span>{analytics.responsesTotal}</span>
      </div>

      <div className="tab-ribbon" role="tablist" aria-label="Survey preference charts">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "favorites"}
          className={activeTab === "favorites" ? "active" : ""}
          onClick={() => setActiveTab("favorites")}
        >
          Favorites
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "products"}
          className={activeTab === "products" ? "active" : ""}
          onClick={() => setActiveTab("products")}
        >
          Other Desired Products
        </button>
      </div>

      {activeTab === "favorites" ? (
        <div className="preference-chart-grid" role="tabpanel">
          <div
            className="sub-tab-ribbon"
            role="tablist"
            aria-label="Favorite answer charts"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeFavoriteTab === "brand"}
              className={activeFavoriteTab === "brand" ? "active" : ""}
              onClick={() => setActiveFavoriteTab("brand")}
            >
              Vape Brand
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeFavoriteTab === "flavor"}
              className={activeFavoriteTab === "flavor" ? "active" : ""}
              onClick={() => setActiveFavoriteTab("flavor")}
            >
              Vape Flavor
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeFavoriteTab === "cigarette"}
              className={activeFavoriteTab === "cigarette" ? "active" : ""}
              onClick={() => setActiveFavoriteTab("cigarette")}
            >
              Cigarette Brand
            </button>
          </div>

          <div className="preference-chart-single" role="tabpanel">
            {activeFavoriteTab === "brand" && (
              <BarChartBlock
                title="Favorite Vape Brand"
                rows={analytics.vapeBrands}
                total={analytics.responsesTotal}
              />
            )}
            {activeFavoriteTab === "flavor" && (
              <BarChartBlock
                title="Favorite Vape Flavor"
                rows={analytics.vapeFlavors}
                total={analytics.responsesTotal}
              />
            )}
            {activeFavoriteTab === "cigarette" && (
              <BarChartBlock
                title="Favorite Cigarette Brand"
                rows={analytics.cigaretteBrands}
                total={analytics.responsesTotal}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="preference-chart-single" role="tabpanel">
          <BarChartBlock
            title="Other Desired Products"
            rows={analytics.smokeShopProducts}
            total={analytics.responsesTotal}
          />
        </div>
      )}
    </section>
  );
}

function ZipMap({ zipDetails, total }) {
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const zctaLayerRef = useRef(null);
  const markerLayerRef = useRef(null);
  const mapRendererRef = useRef(null);
  const zctaLayersByZipRef = useRef(new Map());
  const markersByZipRef = useRef(new Map());
  const [leaflet, setLeaflet] = useState(null);
  const [boundaryData, setBoundaryData] = useState(null);
  const [mapError, setMapError] = useState("");
  const [mapLoading, setMapLoading] = useState(false);

  const zipCodes = useMemo(
    () => [...zipDetails.keys()].filter((zipCode) => /^\d{5}$/.test(zipCode)),
    [zipDetails]
  );

  useEffect(() => {
    let cancelled = false;

    import("leaflet").then((module) => {
      if (!cancelled) {
        setLeaflet(module.default || module);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!leaflet || !mapElementRef.current || mapRef.current) {
      return;
    }

    const map = leaflet.map(mapElementRef.current, {
      scrollWheelZoom: false,
      zoomControl: true,
    }).setView([27.9506, -82.4572], 9);

    leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18,
    }).addTo(map);

    markerLayerRef.current = leaflet.layerGroup().addTo(map);
    mapRendererRef.current = leaflet.svg({ padding: 1.2 });
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      mapRendererRef.current = null;
      zctaLayerRef.current = null;
      zctaLayersByZipRef.current = new Map();
      markersByZipRef.current = new Map();
    };
  }, [leaflet]);

  useEffect(() => {
    if (!zipCodes.length) {
      const timeoutId = window.setTimeout(() => {
        setBoundaryData(null);
        setMapError("");
        setMapLoading(false);
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }

    const abortController = new AbortController();

    async function loadBoundaries() {
      setMapLoading(true);
      setMapError("");

      try {
        const chunkSize = 40;
        const chunks = [];

        for (let index = 0; index < zipCodes.length; index += chunkSize) {
          chunks.push(zipCodes.slice(index, index + chunkSize));
        }

        const geoJsonResponses = await Promise.all(
          chunks.map(async (chunk) => {
            const response = await fetch(buildZctaQueryUrl(chunk), {
              signal: abortController.signal,
            });

            if (!response.ok) {
              throw new Error("Could not load ZIP boundaries.");
            }

            return response.json();
          })
        );
        const features = geoJsonResponses.flatMap((geoJson) =>
          Array.isArray(geoJson.features) ? geoJson.features : []
        );

        setBoundaryData({
          type: "FeatureCollection",
          features,
        });
      } catch (error) {
        if (error.name !== "AbortError") {
          setMapError(error.message || "Could not load ZIP boundaries.");
        }
      } finally {
        if (!abortController.signal.aborted) {
          setMapLoading(false);
        }
      }
    }

    loadBoundaries();

    return () => abortController.abort();
  }, [zipCodes]);

  useEffect(() => {
    const map = mapRef.current;
    const markerLayer = markerLayerRef.current;
    const mapRenderer = mapRendererRef.current;

    if (!leaflet || !map || !markerLayer || !mapRenderer) {
      return;
    }

    if (zctaLayerRef.current) {
      zctaLayerRef.current.remove();
      zctaLayerRef.current = null;
    }

    markerLayer.clearLayers();
    zctaLayersByZipRef.current = new Map();
    markersByZipRef.current = new Map();

    if (!boundaryData?.features?.length) {
      return;
    }

    const maxCount = Math.max(
      ...[...zipDetails.values()].map((detail) => detail.count),
      1
    );

    const getZipStyle = (zipCode) => {
      const detail = zipDetails.get(zipCode);
      const intensity = detail ? detail.count / maxCount : 0;

      return {
        color: detail ? "#1f4b2b" : "#8a7d70",
        fillColor: detail ? "#018548" : "#eadfce",
        fillOpacity: detail ? 0.24 + intensity * 0.42 : 0.05,
        opacity: detail ? 0.9 : 0.35,
        weight: detail ? 1.8 : 1,
      };
    };

    const setZipActive = (zipCode, active) => {
      const layer = zctaLayersByZipRef.current.get(zipCode);
      const marker = markersByZipRef.current.get(zipCode);

      if (layer) {
        layer.setStyle(
          active ?
            {
              color: "#d88b45",
              fillColor: "#d88b45",
              fillOpacity: 0.56,
              opacity: 1,
              weight: 3,
            } :
            getZipStyle(zipCode)
        );

        if (active) {
          layer.bringToFront();
        }
      }

      marker?.getElement()?.classList.toggle("active", active);
    };

    const openZipPopup = (zipCode, latlng) => {
      const detail = zipDetails.get(zipCode);

      if (!detail) {
        return;
      }

      leaflet.popup({
        className: "zip-popup",
        maxWidth: 360,
      })
        .setLatLng(latlng)
        .setContent(buildZipPopupHtml(zipCode, detail))
        .openOn(map);
    };

    const zctaLayer = leaflet.geoJSON(boundaryData, {
      renderer: mapRenderer,
      style: (feature) => getZipStyle(feature.properties?.GEOID || ""),
      onEachFeature: (feature, layer) => {
        const zipCode = feature.properties?.GEOID || feature.properties?.ZCTA5;
        const detail = zipDetails.get(zipCode);

        if (!zipCode || !detail) {
          return;
        }

        zctaLayersByZipRef.current.set(zipCode, layer);

        layer.on({
          click: (event) => openZipPopup(zipCode, event.latlng),
          mouseout: () => setZipActive(zipCode, false),
          mouseover: () => setZipActive(zipCode, true),
        });

        const centerLat = Number.parseFloat(feature.properties?.INTPTLAT);
        const centerLng = Number.parseFloat(feature.properties?.INTPTLON);
        const center =
          Number.isFinite(centerLat) && Number.isFinite(centerLng) ?
            leaflet.latLng(centerLat, centerLng) :
            layer.getBounds().getCenter();
        const marker = leaflet.marker(center, {
          icon: leaflet.divIcon({
            className: "zip-count-marker",
            html: `<span>${detail.count}</span>`,
            iconAnchor: [18, 18],
            iconSize: [36, 36],
          }),
          keyboard: true,
          title: `${zipCode}: ${detail.count} respondent${
            detail.count === 1 ? "" : "s"
          }`,
        }).addTo(markerLayer);

        marker.on({
          click: () => openZipPopup(zipCode, center),
          mouseout: () => setZipActive(zipCode, false),
          mouseover: () => setZipActive(zipCode, true),
        });

        markersByZipRef.current.set(zipCode, marker);
      },
    }).addTo(map);

    zctaLayerRef.current = zctaLayer;

    if (zctaLayer.getBounds().isValid()) {
      map.fitBounds(zctaLayer.getBounds(), {
        maxZoom: 11,
        padding: [28, 28],
      });
    }

    window.setTimeout(() => map.invalidateSize(), 0);
  }, [boundaryData, leaflet, zipDetails]);

  return (
    <section className="dashboard-widget zip-widget">
      <div className="widget-heading">
        <div>
          <h2>ZIP Code Map</h2>
        </div>
        <span>{total}</span>
      </div>

      <div className="zip-map-layout">
        <div className="zip-map-frame">
          <div
            className="zip-map"
            ref={mapElementRef}
            role="img"
            aria-label="ZIP code response map"
          />

          {mapLoading && (
            <div className="zip-map-overlay">Loading ZIP borders...</div>
          )}

          {!zipCodes.length && (
            <div className="zip-map-overlay">No ZIP codes captured yet.</div>
          )}

          {mapError && <div className="zip-map-overlay error">{mapError}</div>}
        </div>
      </div>
    </section>
  );
}

function ReferralFlowGraph({ graph }) {
  const layout = useMemo(() => layoutReferralGraph(graph), [graph]);

  return (
    <section className="dashboard-widget referral-widget">
      <div className="widget-heading">
        <div>
          <h2>Referral Flow</h2>
        </div>
        <span>{graph.edgeCount}</span>
      </div>

      {graph.edgeCount ? (
        <div className="referral-canvas-wrap">
          <div
            className="referral-canvas"
            style={{ "--referral-height": `${layout.height}px` }}
          >
            <svg
              className="referral-lines"
              viewBox={`0 0 100 ${layout.height}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {layout.edges.map((edge) => (
                <path
                  key={edge.key}
                  d={`M ${edge.x1} ${edge.y1} C ${(edge.x1 + edge.x2) / 2} ${
                    edge.y1
                  }, ${(edge.x1 + edge.x2) / 2} ${edge.y2}, ${edge.x2} ${
                    edge.y2
                  }`}
                />
              ))}
            </svg>

            {layout.nodes.map((node) => (
              <div
                className={`referral-node referral-node-depth-${node.depth}`}
                key={node.key}
                style={{ left: `${node.x}%`, top: `${node.y}px` }}
                title={node.title}
              >
                <span>{node.label}</span>
                {node.count > 0 && <strong>{node.count}</strong>}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="empty-state">No referral links have converted yet.</p>
      )}
    </section>
  );
}

function DashboardScreen({ user }) {
  const [responses, setResponses] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const idToken = await user.getIdToken();
      const response = await fetch(DASHBOARD_DATA_URL, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load dashboard data.");
      }

      setResponses(data.surveyResponses || []);
      setEntries(data.sweepstakesEntries || []);
    } catch (error) {
      setErrorMessage(error.message || "Could not load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadDashboardData();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadDashboardData]);

  const verifiedResponses = useMemo(
    () => buildVerifiedResponseSet(responses, entries),
    [responses, entries]
  );
  const analytics = useMemo(
    () => buildAnalytics(verifiedResponses, entries, responses.length),
    [entries, responses.length, verifiedResponses]
  );
  const zipDetails = useMemo(
    () => buildZipDetails(verifiedResponses, entries),
    [entries, verifiedResponses]
  );

  return (
    <main
      className="dashboard-shell"
      style={{ "--app-shell-background": `url(${bayblazeBackground})` }}
    >
      <div className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <p className="dashboard-eyebrow">BayBlaze</p>
            <h1>SWEEPSTAKES DASHBOARD</h1>
            <p className="dashboard-subtitle">
              {analytics.latestSubmission}
            </p>
          </div>

          <div className="dashboard-actions">
            <span>{user.email}</span>
            <button type="button" onClick={loadDashboardData} disabled={loading}>
              Refresh
            </button>
            <button type="button" onClick={() => signOut(auth)}>
              Sign Out
            </button>
          </div>
        </header>

        <section className="metric-grid">
          <MetricCard
            label="Survey Responses"
            value={analytics.responsesTotal}
            detail={
              analytics.excludedResponses ?
                `${analytics.excludedResponses} unmatched responses excluded` :
                `${analytics.completedEntries} completed entries`
            }
          />
          <MetricCard
            label="Verified Entries"
            value={analytics.verifiedEntries}
            detail={`${analytics.entriesTotal} total emails`}
          />
          <MetricCard
            label="Referral Conversions"
            value={analytics.referralGraph.incomingCount}
            detail={`${analytics.referralGraph.edgeCount} referral links used`}
          />
          <MetricCard
            label="Top ZIP Codes"
            value={analytics.zipCodes.length}
            detail={analytics.zipCodes[0]?.label || EMPTY_LABEL}
          />
        </section>

        {loading ? (
          <section className="dashboard-state-card">Loading dashboard...</section>
        ) : errorMessage ? (
          <section className="dashboard-state-card dashboard-error-card">
            <p>{errorMessage}</p>
            <button type="button" onClick={loadDashboardData}>
              Try Again
            </button>
          </section>
        ) : (
          <div className="dashboard-grid">
            <PreferenceTabsWidget analytics={analytics} />
            <ZipMap zipDetails={zipDetails} total={analytics.responsesTotal} />
            <ReferralFlowGraph graph={analytics.referralGraph} />
          </div>
        )}
      </div>
    </main>
  );
}

function Dashboard() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
  }, []);

  if (!authReady) {
    return (
      <main
        className="dashboard-shell dashboard-login-shell"
        style={{ "--app-shell-background": `url(${bayblazeBackground})` }}
      >
        <section className="dashboard-state-card">Checking credentials...</section>
      </main>
    );
  }

  if (!user) {
    return <DashboardLogin />;
  }

  return <DashboardScreen user={user} />;
}

export default Dashboard;
