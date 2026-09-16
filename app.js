(() => {
  "use strict";
  const routes = window.ROUTES || [];
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const state = { selected: null, map: null, layer: null, markers: [] };
  const colors = { "北部":"#2783a6", "中部":"#3f8c5c", "南部":"#e97838", "東部":"#7b63b6" };

  function safeText(value) {
    return String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  }

  function initMap() {
    if (!window.L) {
      $("#map").innerHTML = '<div class="empty">地圖元件暫時無法載入，路線清單與 GPX 下載仍可使用。</div>';
      return;
    }
    state.map = L.map("map", { zoomControl: true, preferCanvas: true }).setView([23.72, 120.93], 7);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'
    }).addTo(state.map);
    state.layer = L.layerGroup().addTo(state.map);
    drawOverview(routes);
  }

  function makePin(color, label) {
    return L.divIcon({
      className: "custom-pin",
      html: `<span style="display:grid;place-items:center;width:27px;height:27px;border-radius:50% 50% 50% 8px;transform:rotate(-45deg);background:${color};color:white;border:2px solid white;box-shadow:0 2px 7px #0004"><b style="transform:rotate(45deg);font-size:10px">${label}</b></span>`,
      iconSize: [29, 29], iconAnchor: [14, 28], popupAnchor: [0, -26]
    });
  }

  function drawOverview(list) {
    if (!state.map) return;
    state.layer.clearLayers();
    list.forEach(r => {
      const color = colors[r.region];
      const line = L.polyline(r.route, { color, weight: 3, opacity: .62 }).addTo(state.layer);
      line.bindTooltip(`${r.name} · ${r.km} km`, { sticky: true });
      line.on("click", () => selectRoute(r.id, true));
    });
    if (list.length) {
      const all = list.flatMap(r => r.route);
      state.map.fitBounds(all, { padding: [20, 20], maxZoom: 9 });
    }
  }

  function showRouteOnMap(route) {
    if (!state.map) return;
    state.layer.clearLayers();
    const color = colors[route.region];
    L.polyline(route.route, { color: "#fff", weight: 9, opacity: .82 }).addTo(state.layer);
    L.polyline(route.route, { color, weight: 5, opacity: .98 }).addTo(state.layer);
    route.pois.forEach((poi, i) => {
      const pinColor = i === 0 ? "#0b3b36" : (i === route.pois.length - 1 ? "#b4473e" : "#e97838");
      const marker = L.marker(poi.c, { icon: makePin(pinColor, i === 0 ? "起" : (i === route.pois.length - 1 ? "終" : String(i))) }).addTo(state.layer);
      marker.bindPopup(`<div class="popup-type">${safeText(poi.t)}</div><div class="popup-title">${safeText(poi.n)}</div><div class="popup-coord">${poi.c[0].toFixed(5)}, ${poi.c[1].toFixed(5)}</div>`);
    });
    state.map.fitBounds(route.route, { padding: [28, 28], maxZoom: 13 });
    if (innerWidth < 721) setTimeout(() => state.map.invalidateSize(), 120);
  }

  function routeCard(r) {
    return `<article class="route-card ${state.selected === r.id ? "selected" : ""}" data-id="${r.id}" tabindex="0" aria-label="${safeText(r.name)}">
      <div class="route-card-top"><div><span class="region-pill">${r.region} · ${safeText(r.start)} → ${safeText(r.end)}</span><h3>${safeText(r.name)}</h3></div><span class="difficulty ${r.difficulty}">${r.difficulty}</span></div>
      <div class="route-meta"><span>↔ ${r.km} km</span><span>◷ ${r.hours}</span></div>
      <p class="route-summary">${safeText(r.summary)}</p>
      <div class="tag-row">${r.types.map(t => `<span class="tag">${t}</span>`).join("")}</div>
      <div class="dedicated"><span>專用道／分離路線</span><div class="progress"><i style="width:${r.dedicatedPct}%"></i></div><b>${r.dedicatedPct}%</b></div>
    </article>`;
  }

  function filteredRoutes() {
    const q = $("#searchInput").value.trim().toLowerCase();
    const region = $("#regionFilter").value;
    const distance = $("#distanceFilter").value;
    const type = $("#typeFilter").value;
    return routes.filter(r => {
      const haystack = [r.name,r.region,r.summary,r.train,...r.highlights,...r.food,...r.supply,...r.types].join(" ").toLowerCase();
      const distanceOK = distance === "all" || (distance === "short" && r.km <= 40) || (distance === "medium" && r.km > 40 && r.km <= 55) || (distance === "long" && r.km > 55);
      return (!q || haystack.includes(q)) && (region === "all" || r.region === region) && distanceOK && (type === "all" || r.types.includes(type));
    });
  }

  function renderRoutes(redrawMap = true) {
    const list = filteredRoutes();
    $("#resultCount").textContent = `顯示 ${list.length}／${routes.length} 條路線`;
    $("#routeList").innerHTML = list.length ? list.map(routeCard).join("") : '<div class="empty"><b>沒有符合的路線</b><br>試著放寬距離或路線類型。</div>';
    $$(".route-card").forEach(card => {
      card.addEventListener("click", () => selectRoute(card.dataset.id, true));
      card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") selectRoute(card.dataset.id, true); });
    });
    if (redrawMap) drawOverview(list);
  }

  function selectRoute(id, scrollMap = false) {
    const route = routes.find(r => r.id === id);
    if (!route) return;
    state.selected = id;
    renderRoutes(false);
    showRouteOnMap(route);
    const selected = $(`.route-card[data-id="${id}"]`);
    if (selected && innerWidth > 720) selected.scrollIntoView({ block: "nearest", behavior: "smooth" });
    if (scrollMap && innerWidth <= 720) $(".map-shell").scrollIntoView({ block: "center", behavior: "smooth" });
    openDetail(route);
  }

  function detailList(items) {
    return `<ul>${items.map(x => `<li>${safeText(x)}</li>`).join("")}</ul>`;
  }

  function openDetail(r) {
    const content = $("#dialogContent");
    content.innerHTML = `<div class="dialog-hero">
      <span class="region-pill">${r.region} · ${r.types.join(" ／ ")}</span>
      <h2>${safeText(r.name)}</h2><p>${safeText(r.summary)}</p>
      <div class="dialog-stats"><div><b>${r.km} km</b><span>規劃距離</span></div><div><b>${r.hours}</b><span>含停留估時</span></div><div><b>${r.difficulty}</b><span>難度</span></div><div><b>${r.dedicatedPct}%</b><span>專用／分離路線</span></div></div>
    </div><div class="dialog-body">
      <div class="route-strip"><span>🚉 ${safeText(r.start)}</span><i></i><span>${safeText(r.end)} 🚉</span></div>
      <div class="detail-grid">
        <div class="detail-block"><h4>台鐵銜接方式</h4><p>${safeText(r.train)}</p></div>
        <div class="detail-block"><h4>景點特色</h4>${detailList(r.highlights)}</div>
        <div class="detail-block"><h4>補給與休息</h4>${detailList(r.supply)}</div>
        <div class="detail-block"><h4>美食推薦</h4>${detailList(r.food)}</div>
        <div class="detail-block"><h4>騎乘提醒</h4>${detailList(r.cautions)}</div>
        <div class="detail-block"><h4>雙電池策略</h4><p>${r.km > 58 ? "里程或爬升接近上限：首顆保留至約 30–40 km 再換，第二顆須保有 25% 緊急餘量。" : "建議在主要午餐／補給點換電；首顆勿騎到完全斷電，以保留繞路與逆風餘量。"}</p></div>
      </div>
      <div class="detail-block"><h4>景點與重要節點座標</h4>
        <div style="overflow:auto"><table class="poi-table"><thead><tr><th>節點</th><th>類型</th><th>WGS84 座標</th></tr></thead><tbody>${r.pois.map(p => `<tr><td>${safeText(p.n)}</td><td>${safeText(p.t)}</td><td class="coord">${p.c[0].toFixed(5)}, ${p.c[1].toFixed(5)}</td></tr>`).join("")}</tbody></table></div>
      </div>
      <div class="dialog-actions"><button class="download" data-download="${r.id}">下載規劃 GPX</button><a class="maps-link" href="${mapsUrl(r)}" target="_blank" rel="noopener">用 Google Maps 檢視起訖點 ↗</a></div>
    </div>`;
    $("[data-download]", content).addEventListener("click", () => downloadGPX(r));
    const dialog = $("#routeDialog");
    if (!dialog.open) dialog.showModal();
  }

  function mapsUrl(r) {
    const a = r.route[0], b = r.route[r.route.length - 1];
    return `https://www.google.com/maps/dir/?api=1&origin=${a[0]},${a[1]}&destination=${b[0]},${b[1]}&travelmode=bicycling`;
  }

  function xmlEscape(s) { return String(s).replace(/[<>&'"]/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;",'"':"&quot;"}[c])); }
  function downloadGPX(r) {
    const points = r.pois.map(p => `<wpt lat="${p.c[0]}" lon="${p.c[1]}"><name>${xmlEscape(p.n)}</name><type>${xmlEscape(p.t)}</type></wpt>`).join("");
    const track = r.route.map(c => `<trkpt lat="${c[0]}" lon="${c[1]}"></trkpt>`).join("");
    const gpx = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="騎電台灣" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${xmlEscape(r.name)}</name><desc>行前規劃軌跡，非即時導航；出發前依道路管制與現場標誌調整。</desc></metadata>${points}<trk><name>${xmlEscape(r.name)}</name><trkseg>${track}</trkseg></trk></gpx>`;
    const url = URL.createObjectURL(new Blob([gpx], { type: "application/gpx+xml" }));
    const a = document.createElement("a"); a.href = url; a.download = `${r.id}-${r.name.replace(/[・／]/g,"-")}.gpx`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function initControls() {
    ["searchInput","regionFilter","distanceFilter","typeFilter"].forEach(id => {
      $("#" + id).addEventListener(id === "searchInput" ? "input" : "change", () => { state.selected = null; renderRoutes(); });
    });
    $("#resetFilters").addEventListener("click", () => {
      $("#searchInput").value = ""; $("#regionFilter").value = "all"; $("#distanceFilter").value = "all"; $("#typeFilter").value = "all"; state.selected = null; renderRoutes();
    });
    $("#mapReset").addEventListener("click", () => { state.selected = null; renderRoutes(); });
    $$('[data-jump]').forEach(btn => btn.addEventListener("click", () => $("#" + btn.dataset.jump).scrollIntoView({ behavior: "smooth" })));
    $(".dialog-close").addEventListener("click", () => $("#routeDialog").close());
    $("#routeDialog").addEventListener("click", e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
    $$("#checkGrid input").forEach(box => {
      try { box.checked = localStorage.getItem("bike-check-" + box.dataset.check) === "1"; } catch {}
      box.addEventListener("change", () => { try { localStorage.setItem("bike-check-" + box.dataset.check, box.checked ? "1" : "0"); } catch {} });
    });
  }

  initControls();
  initMap();
  renderRoutes(false);
  window.addEventListener("resize", () => state.map && state.map.invalidateSize());
})();
