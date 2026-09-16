(() => {
  "use strict";
  const STORAGE_KEY = "taiwan-bike-personal-routes-v1";
  const baseRoutes = window.ROUTES || [];
  let personalRoutes = loadPersonalRoutes();
  let routes = [...baseRoutes, ...personalRoutes];
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const state = { selected: null, map: null, layer: null, markers: [] };
  const colors = { "北部":"#2783a6", "中部":"#3f8c5c", "南部":"#e97838", "東部":"#7b63b6", "我的路線":"#b7791f" };

  function loadPersonalRoutes() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(saved) ? saved.filter(r => r && r.personal && Array.isArray(r.route)) : [];
    } catch { return []; }
  }

  function savePersonalRoutes() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(personalRoutes)); return true; }
    catch { return false; }
  }

  function refreshRoutes() {
    routes = [...baseRoutes, ...personalRoutes];
    updatePersonalStatus();
    state.selected = null;
    renderRoutes();
  }

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
      const color = colors[r.region] || "#177a68";
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
    const color = colors[route.region] || "#177a68";
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
    const sourceClass = r.personal ? "personal" : (/^官方/.test(r.source?.kind || "") ? "official" : "");
    return `<article class="route-card ${r.personal ? "personal-route" : ""} ${state.selected === r.id ? "selected" : ""}" data-id="${r.id}" tabindex="0" aria-label="${safeText(r.name)}">
      <div class="route-card-top"><div><span class="region-pill">${r.region} · ${safeText(r.start)} → ${safeText(r.end)}</span><h3>${safeText(r.name)}</h3></div><span class="difficulty ${r.difficulty}">${r.difficulty}</span></div>
      <div class="route-meta"><span>↔ ${r.km} km</span><span>◷ ${r.hours}</span></div>
      <p class="route-summary">${safeText(r.summary)}</p>
      <div class="tag-row">${r.types.map(t => `<span class="tag">${t}</span>`).join("")}</div>
      <div class="dedicated"><span>專用道／分離路線</span><div class="progress"><i style="width:${r.dedicatedPct}%"></i></div><b>${r.dedicatedPct}%</b></div>
      <div class="source-row"><span class="source-badge ${sourceClass}">${safeText(r.source?.kind || "本站規劃")}</span><span class="region-pill">${safeText(r.source?.label || "行前規劃")}</span></div>
    </article>`;
  }

  function filteredRoutes() {
    const q = $("#searchInput").value.trim().toLowerCase();
    const region = $("#regionFilter").value;
    const distance = $("#distanceFilter").value;
    const type = $("#typeFilter").value;
    const source = $("#sourceFilter").value;
    return routes.filter(r => {
      const haystack = [r.name,r.region,r.summary,r.train,r.source?.label,r.source?.kind,...r.highlights,...r.food,...r.supply,...r.types].join(" ").toLowerCase();
      const distanceOK = distance === "all" || (distance === "short" && r.km <= 40) || (distance === "medium" && r.km > 40 && r.km <= 55) || (distance === "long" && r.km > 55);
      const kind = r.source?.kind || "本站規劃";
      const sourceOK = source === "all" || (source === "official" && kind === "官方原線") || (source === "extended" && kind.includes("官方") && kind !== "官方原線") || (source === "planned" && kind === "本站規劃") || (source === "personal" && r.personal);
      return (!q || haystack.includes(q)) && (region === "all" || r.region === region) && distanceOK && (type === "all" || r.types.includes(type)) && sourceOK;
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
      <div class="source-row"><span class="source-badge ${r.personal ? "personal" : (/^官方/.test(r.source?.kind || "") ? "official" : "")}">${safeText(r.source?.kind || "本站規劃")}</span>${r.source?.url ? `<a class="source-link" href="${r.source.url}" target="_blank" rel="noopener">${safeText(r.source.label)} ↗</a>` : `<span class="source-link">${safeText(r.source?.label || "行前規劃")}</span>`}</div>
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
      <div class="dialog-actions"><button class="download" data-download="${r.id}">${r.personal ? "下載原始路線 GPX" : "下載規劃 GPX"}</button><a class="maps-link" href="${mapsUrl(r)}" target="_blank" rel="noopener">用 Google Maps 檢視起訖點 ↗</a>${r.personal ? `<button class="personal-delete" data-delete-personal="${r.id}">從本機刪除</button>` : ""}</div>
    </div>`;
    $("[data-download]", content).addEventListener("click", () => downloadGPX(r));
    if (r.personal) $("[data-delete-personal]", content).addEventListener("click", () => deletePersonalRoute(r.id));
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

  function haversine(a, b) {
    const toRad = x => x * Math.PI / 180, earth = 6371;
    const dLat = toRad(b[0] - a[0]), dLon = toRad(b[1] - a[1]);
    const v = Math.sin(dLat/2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon/2) ** 2;
    return 2 * earth * Math.asin(Math.sqrt(v));
  }

  function routeDistance(points) {
    return points.slice(1).reduce((sum, p, i) => sum + haversine(points[i], p), 0);
  }

  function parseGPX(text, filename) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("GPX 格式無法解析");
    let nodes = [...doc.getElementsByTagName("trkpt")];
    if (!nodes.length) nodes = [...doc.getElementsByTagName("rtept")];
    if (nodes.length < 2) throw new Error("找不到足夠的軌跡點");
    const raw = nodes.map(n => [Number(n.getAttribute("lat")), Number(n.getAttribute("lon"))]).filter(p => p.every(Number.isFinite));
    if (raw.length < 2) throw new Error("軌跡座標無效");
    const step = Math.max(1, Math.ceil(raw.length / 3000));
    const points = raw.filter((_, i) => i % step === 0);
    if (points[points.length - 1] !== raw[raw.length - 1]) points.push(raw[raw.length - 1]);
    const distance = Math.max(.1, routeDistance(raw));
    const km = Math.round(distance * 10) / 10;
    const gpxName = doc.getElementsByTagName("name")[0]?.textContent?.trim();
    const name = gpxName || filename.replace(/\.gpx$/i, "") || "我的騎乘路線";
    const difficulty = km > 60 ? "挑戰" : (km > 35 ? "中等" : "輕鬆");
    return {
      id:`personal-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, name, region:"我的路線", km, difficulty,
      hours:`約 ${Math.max(1, Math.round((distance / 15 + 1) * 10) / 10)} 小時`, types:["我的騎乘","GPX"], dedicatedPct:0,
      start:"GPX 起點", end:"GPX 終點", personal:true, importedAt:new Date().toISOString(),
      train:"個人匯入路線未自動判定台鐵銜接；可依起終點座標對照最近車站。",
      summary:`從 ${filename} 匯入的個人騎乘紀錄，共 ${raw.length.toLocaleString()} 個原始軌跡點；僅儲存在目前瀏覽器。`,
      highlights:["個人實際騎乘軌跡"], supply:["可在路線詳情中持續參考原 GPX"], food:[],
      cautions:["個人路線不會自動同步到其他裝置","清除瀏覽器網站資料可能一併刪除，請使用備份功能"],
      route:points, pois:[{n:"個人路線起點",t:"起點",c:points[0]},{n:"個人路線終點",t:"終點",c:points[points.length-1]}],
      source:{kind:"個人 GPX",label:filename,url:null}
    };
  }

  async function importGPXFiles(fileList) {
    const files = [...fileList];
    if (!files.length) return;
    const imported = [], errors = [];
    for (const file of files) {
      try { imported.push(parseGPX(await file.text(), file.name)); }
      catch (e) { errors.push(`${file.name}：${e.message}`); }
    }
    personalRoutes.push(...imported);
    const saved = savePersonalRoutes();
    refreshRoutes();
    $("#gpxImport").value = "";
    const message = imported.length ? `已匯入 ${imported.length} 條路線${saved ? "" : "，但瀏覽器儲存空間不足"}` : "沒有成功匯入路線";
    $("#personalStatus").textContent = errors.length ? `${message}；${errors.join("；")}` : message;
  }

  function updatePersonalStatus() {
    const status = $("#personalStatus");
    if (status) status.textContent = personalRoutes.length ? `這台裝置已保存 ${personalRoutes.length} 條個人路線` : "尚未匯入個人路線";
    const exportButton = $("#exportPersonal");
    if (exportButton) exportButton.disabled = !personalRoutes.length;
  }

  function deletePersonalRoute(id) {
    const route = personalRoutes.find(r => r.id === id);
    if (!route || !window.confirm(`確定從這台裝置刪除「${route.name}」？`)) return;
    personalRoutes = personalRoutes.filter(r => r.id !== id);
    savePersonalRoutes();
    $("#routeDialog").close();
    refreshRoutes();
  }

  function exportPersonalRoutes() {
    if (!personalRoutes.length) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),routes:personalRoutes},null,2)], {type:"application/json"}));
    const a = document.createElement("a"); a.href = url; a.download = `我的單車路線備份-${new Date().toISOString().slice(0,10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function initControls() {
    ["searchInput","regionFilter","distanceFilter","typeFilter","sourceFilter"].forEach(id => {
      $("#" + id).addEventListener(id === "searchInput" ? "input" : "change", () => { state.selected = null; renderRoutes(); });
    });
    $("#resetFilters").addEventListener("click", () => {
      $("#searchInput").value = ""; $("#regionFilter").value = "all"; $("#distanceFilter").value = "all"; $("#typeFilter").value = "all"; $("#sourceFilter").value = "all"; state.selected = null; renderRoutes();
    });
    $("#gpxImport").addEventListener("change", e => importGPXFiles(e.target.files));
    $("#exportPersonal").addEventListener("click", exportPersonalRoutes);
    $("#clearPersonal").addEventListener("click", () => {
      if (!personalRoutes.length || !window.confirm(`確定清除這台裝置上的 ${personalRoutes.length} 條個人路線？`)) return;
      personalRoutes = []; savePersonalRoutes(); refreshRoutes();
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
  updatePersonalStatus();
  initMap();
  renderRoutes(false);
  window.addEventListener("resize", () => state.map && state.map.invalidateSize());
})();
