/* Tribal Wars - Marcador visual de aldeias V7
 *
 * Barra de acesso rápido:
 * javascript:$.getScript('https://cdn.jsdelivr.net/gh/JoaoMendonca99/tribalwars-scripts@main/tw-map-marker-v7.js?v=1');
 */
(function () {
  const w = window;

  if (!w.TWMap || !w.TWMap.villages) {
    return;
  }

  document.querySelectorAll(".twm_mark, .twm_defense_mark, .twm_attack_mark, .twm_panel, .twm_main_panel").forEach(function (el) {
    el.remove();
  });

  if (w.__twm_defense_cancel) {
    w.__twm_defense_cancel();
    w.__twm_defense_cancel = null;
  }

  if (w.__twm_attack_cancel) {
    w.__twm_attack_cancel();
    w.__twm_attack_cancel = null;
  }

  if (w.__twm_interval) {
    clearInterval(w.__twm_interval);
    w.__twm_interval = null;
  }

  if (w.__twm_fullscreen_listener) {
    document.removeEventListener("fullscreenchange", w.__twm_fullscreen_listener);
    w.__twm_fullscreen_listener = null;
  }

  if (w.__twm_click_listener) {
    document.removeEventListener("click", w.__twm_click_listener, true);
    w.__twm_click_listener = null;
  }

  if (w.__twm_defense_capture_timer) {
    clearTimeout(w.__twm_defense_capture_timer);
    w.__twm_defense_capture_timer = null;
  }

  if (w.__twm_defense_mapping_timer) {
    clearTimeout(w.__twm_defense_mapping_timer);
    w.__twm_defense_mapping_timer = null;
  }

  if (w.__twm_attack_mapping_timer) {
    clearTimeout(w.__twm_attack_mapping_timer);
    w.__twm_attack_mapping_timer = null;
  }

  let clickMode = false;
  let activeGroupId = null;
  let groupIndex = 0;

  const groups = {};

  const DEFENSE_UNITS = ["spear", "sword", "archer", "heavy"];
  const DEFENSE_FETCH_DELAY = 280;
  const ATTACK_FETCH_DELAY = 320;

  let defenseResults = {};
  let defenseMappingCancelled = false;
  let defenseMappingInProgress = false;

  let attackResults = {};
  let attackMappingCancelled = false;
  let attackMappingInProgress = false;

  let attackerSourceResults = {};

  const ATTACKERS_GROUP_ID = "system_attackers";
  const ATTACK_ALL_OWN = "__all_own__";
  const DEBUG_ATTACK_PARSER = true;

  const ATTACK_RISK_COLORS = {
    scout: "#00bfff",
    aguardando: "#808080",
    incerto: "#808080",
    baixo: "#ffd000",
    medio: "#ff8c00",
    alto: "#ff0000",
    critico: "#8a00ff"
  };

  const ICON_PRESETS = [
    { label: "Sem ícone", value: "", src: "" },
    { label: "Lança", value: "spear", src: "/graphic/unit_map/spear.png" },
    { label: "Espada", value: "sword", src: "/graphic/unit_map/sword.png" },
    { label: "Machado", value: "axe", src: "/graphic/unit_map/axe.png" },
    { label: "Arqueiro", value: "archer", src: "/graphic/unit_map/archer.webp" },
    { label: "Espião", value: "spy", src: "/graphic/unit_map/spy.webp" },
    { label: "Leve", value: "light", src: "/graphic/unit_map/light.png" },
    { label: "Arq. montado", value: "marcher", src: "/graphic/unit_map/marcher.png" },
    { label: "Pesada", value: "heavy", src: "/graphic/unit_map/heavy.webp" },
    { label: "Aríete", value: "ram", src: "/graphic/unit_map/ram.webp" },
    { label: "Catapulta", value: "catapult", src: "/graphic/unit_map/catapult.webp" },
    { label: "Paladino", value: "knight", src: "/graphic/unit_map/knight.png" },
    { label: "Nobre", value: "snob", src: "/graphic/unit_map/snob.png" },
    { label: "Milícia", value: "militia", src: "/graphic/unit_map/militia.webp" }
  ];

  function host() {
    return (
      document.fullscreenElement ||
      document.getElementById("map_wrap") ||
      document.getElementById("map") ||
      document.body
    );
  }

  function movePanelsToHost() {
    const h = host();

    document.querySelectorAll(".twm_panel, .twm_main_panel").forEach(function (panel) {
      if (panel.parentElement !== h) {
        h.appendChild(panel);
      }
      panel.style.zIndex = "2147483647";
    });
  }

  function getNextPanelPosition(index) {
    const startLeft = 20;
    const startTop = 160;
    const gapX = 360;
    const gapY = 260;
    const cols = 3;

    return {
      left: startLeft + (index % cols) * gapX,
      top: startTop + Math.floor(index / cols) * gapY
    };
  }

  function keyOf(coord) {
    return String(coord).replace("|", "");
  }

  function coordText(key) {
    key = String(key);
    return key.includes("|") ? key : key.slice(0, 3) + "|" + key.slice(3);
  }

  function parseCoords(text) {
    const out = [];
    const str = String(text || "");

    (str.match(/\d{3}\s*\|\s*\d{3}|\d{3}\s*[,; ]\s*\d{3}/g) || []).forEach(function (part) {
      const match = part.match(/(\d{3})\D+(\d{3})/);

      if (match) {
        out.push(match[1] + "|" + match[2]);
      }
    });

    const digits = str.replace(/\D/g, "");

    for (let i = 0; i + 6 <= digits.length; i += 6) {
      out.push(digits.slice(i, i + 3) + "|" + digits.slice(i + 3, i + 6));
    }

    return [...new Set(out)];
  }

  function formatCoordInput(raw) {
    const digits = String(raw || "").replace(/\D/g, "");
    const chunks = [];

    for (let i = 0; i < digits.length; i += 6) {
      const part = digits.slice(i, i + 6);

      if (part.length <= 3) {
        chunks.push(part.length === 3 ? part + "|" : part);
      } else {
        chunks.push(part.slice(0, 3) + "|" + part.slice(3, 6));
      }
    }

    return chunks.join(" ") + (digits.length > 0 && digits.length % 6 === 0 ? " " : "");
  }

  function alpha(hex, opacity) {
    hex = String(hex || "#ff0000").replace("#", "");

    let r = parseInt(hex.slice(0, 2), 16);
    let g = parseInt(hex.slice(2, 4), 16);
    let b = parseInt(hex.slice(4, 6), 16);

    if (isNaN(r) || isNaN(g) || isNaN(b)) {
      r = 255;
      g = 0;
      b = 0;
    }

    return "rgba(" + r + "," + g + "," + b + "," + opacity + ")";
  }

  function gameAssetBase() {
    if (w.game_data && w.game_data.cdn) {
      return String(w.game_data.cdn).replace(/\/$/, "");
    }

    if (w.image_base) {
      return String(w.image_base).replace(/\/$/, "");
    }

    return "";
  }

  function iconCandidates(icon) {
    const urls = [];
    icon = String(icon || "").trim();

    if (!icon) {
      return urls;
    }

    if (icon.startsWith("http://") || icon.startsWith("https://")) {
      urls.push(icon);
      return urls;
    }

    if (icon.startsWith("/graphic/")) {
      urls.push(icon);

      if (icon.endsWith(".png")) {
        urls.push(icon.replace(/\.png$/, ".webp"));
      } else if (icon.endsWith(".webp")) {
        urls.push(icon.replace(/\.webp$/, ".png"));
      } else {
        urls.push(icon + ".png");
        urls.push(icon + ".webp");
      }

      const cdn = gameAssetBase();
      if (cdn) {
        urls.slice().forEach(function (url) {
          urls.push(cdn + url);
        });
      }

      return uniqueUrls(urls);
    }

    const unit = icon.replace(/^\/+/, "").replace(/\.(png|webp)$/i, "");
    const basePath = "/graphic/unit_map/" + unit;

    urls.push(basePath + ".png");
    urls.push(basePath + ".webp");

    const cdn = gameAssetBase();
    if (cdn) {
      urls.push(cdn + basePath + ".png");
      urls.push(cdn + basePath + ".webp");
    }

    return uniqueUrls(urls);
  }

  function uniqueUrls(urls) {
    const seen = {};
    const out = [];

    urls.forEach(function (url) {
      if (!url || seen[url]) {
        return;
      }
      seen[url] = true;
      out.push(url);
    });

    return out;
  }

  function coordsToText(group) {
    return Object.keys(group.coords || {})
      .map(coordText)
      .sort()
      .join("\n");
  }

  function removeCoordFromAll(coord) {
    Object.values(groups).forEach(function (group) {
      delete group.coords[coord];
    });
  }

  function findCoordByVillageId(id) {
    for (const [key, village] of Object.entries(w.TWMap.villages || {})) {
      if (String(village.id) === String(id)) {
        return coordText(key);
      }
    }

    return null;
  }

  function coordFromEvent(event) {
    try {
      const map = document.getElementById("map");
      const rect = map.getBoundingClientRect();
      const px = event.clientX - rect.left + w.TWMap.map.pos[0];
      const py = event.clientY - rect.top + w.TWMap.map.pos[1];
      const coord = w.TWMap.map.coordByPixel(px, py);

      if (coord && coord.length >= 2) {
        return coord[0] + "|" + coord[1];
      }
    } catch (err) {}

    return null;
  }

  function clearMarks() {
    document.querySelectorAll(".twm_mark").forEach(function (mark) {
      mark.remove();
    });
  }

  function emptyDefenseUnits() {
    return {
      spear: 0,
      sword: 0,
      archer: 0,
      heavy: 0
    };
  }

  function getPlayerId() {
    return w.game_data && w.game_data.player ? w.game_data.player.id : null;
  }

  function isOwnVillage(village) {
    const playerId = getPlayerId();

    if (!playerId || !village) {
      return false;
    }

    const pid = String(playerId);

    if (
      String(village.player_id) === pid ||
      String(village.player) === pid ||
      String(village.owner_id) === pid
    ) {
      return true;
    }

    if (village.owner) {
      if (String(village.owner.id) === pid || String(village.owner) === pid) {
        return true;
      }
    }

    const gdVillages = w.game_data && w.game_data.villages;

    if (gdVillages && typeof gdVillages === "object" && !Array.isArray(gdVillages)) {
      if (gdVillages[village.id] || gdVillages[String(village.id)]) {
        return true;
      }
    }

    return false;
  }

  function isOwnCoord(coord) {
    if (!coord) {
      return false;
    }

    const village = w.TWMap.villages && w.TWMap.villages[keyOf(coord)];

    if (!village) {
      return false;
    }

    return isOwnVillage(village);
  }

  function isOwnVillageId(villageId) {
    const gdVillages = w.game_data && w.game_data.villages;

    if (!gdVillages || villageId == null) {
      return false;
    }

    return !!(gdVillages[villageId] || gdVillages[String(villageId)]);
  }

  function padCoordPart(value) {
    const digits = String(value == null ? "" : value).replace(/\D/g, "");

    if (!digits) {
      return "";
    }

    return digits.padStart(3, "0").slice(-3);
  }

  function coordFromGameVillage(village) {
    if (!village) {
      return null;
    }

    if (village.x != null && village.y != null) {
      const x = padCoordPart(village.x);
      const y = padCoordPart(village.y);

      if (x && y) {
        return x + "|" + y;
      }
    }

    if (village.coord) {
      const parsed = parseCoords(String(village.coord));

      if (parsed.length) {
        return parsed[0];
      }
    }

    return null;
  }

  function extractVillageIdFromHref(href) {
    const h = String(href || "");
    const match =
      h.match(/info_village[^&]*&(?:amp;)?id=(\d+)/i) ||
      h.match(/[?&]village=(\d+)/);

    return match ? match[1] : null;
  }

  function resolveOwnVillageEntry(villageId) {
    const id = String(villageId);
    const gdVillages = w.game_data && w.game_data.villages;
    const gdV = gdVillages && (gdVillages[id] || gdVillages[villageId]);

    if (!isOwnVillageId(id)) {
      return null;
    }

    return {
      villageId: id,
      coord: coordFromGameVillage(gdV) || findCoordByVillageId(id) || null,
      name: (gdV && gdV.name) || ""
    };
  }

  function pushOwnVillageItem(result, seen, villageId, coord, name) {
    const id = String(villageId);

    if (!id || seen[id]) {
      return;
    }

    seen[id] = 1;
    result.push({
      villageId: id,
      coord: coord || null,
      name: name || ""
    });
  }

  async function getAllOwnVillages() {
    const seen = {};
    const result = [];

    const gdVillages = w.game_data && w.game_data.villages;

    if (gdVillages && typeof gdVillages === "object") {
      if (Array.isArray(gdVillages)) {
        gdVillages.forEach(function (gdV) {
          if (!gdV) {
            return;
          }

          pushOwnVillageItem(
            result,
            seen,
            gdV.id || gdV.village_id,
            coordFromGameVillage(gdV),
            gdV.name
          );
        });
      } else {
        Object.keys(gdVillages).forEach(function (key) {
          const gdV = gdVillages[key];

          pushOwnVillageItem(
            result,
            seen,
            (gdV && gdV.id) || key,
            coordFromGameVillage(gdV),
            gdV && gdV.name
          );
        });
      }
    }

    if (result.length) {
      return result;
    }

    const overviewModes = ["combined", "prod", "production"];

    for (let i = 0; i < overviewModes.length; i++) {
      try {
        const html = await fetchGameUrl(buildOverviewVillagesUrl(overviewModes[i]));
        const fromOverview = parseOwnVillagesFromOverview(html);

        fromOverview.forEach(function (item) {
          pushOwnVillageItem(result, seen, item.villageId, item.coord, item.name);
        });

        if (result.length) {
          return result;
        }
      } catch (err) {
        if (DEBUG_ATTACK_PARSER) {
          console.log("[OwnVillages] overview " + overviewModes[i] + " falhou", err);
        }
      }
    }

    parseOwnVillagesFromDomDropdown().forEach(function (item) {
      pushOwnVillageItem(result, seen, item.villageId, item.coord, item.name);
    });

    return result;
  }

  async function getAllOwnVillagesForDefenseMapping() {
    return getAllOwnVillages();
  }

  async function getAllOwnVillagesForAttackMapping() {
    return getAllOwnVillagesForDefenseMapping();
  }

  function buildOverviewVillagesUrl(mode) {
    const sourceId = w.game_data && w.game_data.village ? w.game_data.village.id : null;
    const base =
      (w.game_data && w.game_data.link_base_pure) ||
      (sourceId ? "/game.php?village=" + sourceId + "&screen=" : "/game.php?screen=");

    return base + "overview_villages" + (mode ? "&mode=" + mode : "");
  }

  function parseOwnVillagesFromOverview(html) {
    const doc = document.createElement("div");

    doc.innerHTML = html;

    const items = [];
    const seen = {};

    doc.querySelectorAll("a[href*='village='], a[href*='info_village']").forEach(function (link) {
      const id = extractVillageIdFromHref(link.getAttribute("href"));

      if (!id || !isOwnVillageId(id) || seen[id]) {
        return;
      }

      seen[id] = 1;

      const row = link.closest("tr");
      const rowText = row ? (row.innerText || row.textContent || "") : (link.textContent || "");
      const coordMatch = rowText.match(/(\d{3})\s*\|\s*(\d{3})/);

      items.push({
        villageId: id,
        coord: coordMatch ? coordMatch[1] + "|" + coordMatch[2] : null,
        name: (link.textContent || "").trim()
      });
    });

    return items;
  }

  function parseOwnVillagesFromDomDropdown() {
    const items = [];
    const seen = {};

    document.querySelectorAll(
      "#village_select option, #village_list option, select[name='village'] option, .village-selector option"
    ).forEach(function (opt) {
      const id = String(opt.value || "").trim();

      if (!id || !/^\d+$/.test(id) || !isOwnVillageId(id) || seen[id]) {
        return;
      }

      seen[id] = 1;

      const text = opt.textContent || "";
      const coordMatch = text.match(/(\d{3})\s*\|\s*(\d{3})/);

      items.push({
        villageId: id,
        coord: coordMatch ? coordMatch[1] + "|" + coordMatch[2] : null,
        name: text.trim()
      });
    });

    return items;
  }

  function findVillageIdByCoord(coord) {
    if (!coord) {
      return null;
    }

    const mapVillage = w.TWMap.villages[keyOf(coord)];

    if (mapVillage && mapVillage.id) {
      return String(mapVillage.id);
    }

    const gdVillages = w.game_data && w.game_data.villages;

    if (!gdVillages || typeof gdVillages !== "object") {
      return null;
    }

    let foundId = null;

    Object.keys(gdVillages).forEach(function (key) {
      if (foundId) {
        return;
      }

      const gdV = gdVillages[key];
      const gdCoord = coordFromGameVillage(gdV);

      if (gdCoord && keyOf(gdCoord) === keyOf(coord)) {
        foundId = String((gdV && gdV.id) || key);
      }
    });

    return foundId;
  }

  function parseHtmlDoc(html) {
    if (typeof DOMParser !== "undefined") {
      return new DOMParser().parseFromString(String(html || ""), "text/html");
    }

    const doc = document.createElement("div");

    doc.innerHTML = html;

    return doc;
  }

  function extractTargetCoordFromInfoVillageHtml(html) {
    const match = String(html || "").match(/(\d{3})\s*\|\s*(\d{3})/);

    return match ? match[1] + "|" + match[2] : null;
  }

  function parseIntSafe(value) {
    const n = parseInt(String(value || "").replace(/\./g, "").replace(/\s/g, ""), 10);
    return isNaN(n) ? 0 : n;
  }

  function addDefenseUnits(target, source) {
    DEFENSE_UNITS.forEach(function (unit) {
      target[unit] += parseIntSafe(source && source[unit]);
    });
    return target;
  }

  function parseUnitsFromUnitItems(root) {
    const units = emptyDefenseUnits();

    root.querySelectorAll(".unit-item, td.unit-item, [class*='unit-item-']").forEach(function (cell) {
      let unit = cell.id || cell.getAttribute("data-unit") || "";

      if (!unit && cell.className) {
        const match = String(cell.className).match(/unit-item-(\w+)/);
        if (match) {
          unit = match[1];
        }
      }

      if (DEFENSE_UNITS.indexOf(unit) === -1) {
        return;
      }

      const input = cell.querySelector("input");
      const amountText = input ? input.value : cell.textContent;
      units[unit] += parseIntSafe(amountText);
    });

    return units;
  }

  function parsePlaceWithdrawHtml(html) {
    const doc = document.createElement("div");
    doc.innerHTML = html;

    const ownUnits = emptyDefenseUnits();
    const supportUnits = emptyDefenseUnits();
    const table = doc.querySelector("#withdraw_selected_units_village_info");

    if (!table) {
      return null;
    }

    const rows = table.querySelectorAll("tbody tr");

    rows.forEach(function (row, index) {
      if (index === 0) {
        return;
      }

      const hasPlayerLink = row.querySelector("td:first-child a");
      const rowUnits = parseUnitsFromUnitItems(row);

      if (hasPlayerLink) {
        addDefenseUnits(supportUnits, rowUnits);
      } else if (Object.values(rowUnits).some(function (v) { return v > 0; })) {
        addDefenseUnits(ownUnits, rowUnits);
      }
    });

    return {
      ownUnits: ownUnits,
      supportUnits: supportUnits
    };
  }

  function parseInfoVillageHtml(html) {
    const doc = document.createElement("div");
    doc.innerHTML = html;

    const ownUnits = emptyDefenseUnits();
    const supportUnits = emptyDefenseUnits();
    let current = ownUnits;
    let found = false;

    doc.querySelectorAll("table").forEach(function (table) {
      const heading = (table.previousElementSibling && table.previousElementSibling.textContent) || "";
      const caption = (table.querySelector("caption") && table.querySelector("caption").textContent) || "";
      const label = (heading + " " + caption).toLowerCase();

      if (/support|apoio|terceir|ally|aliad|foreign|fremd|steun/.test(label)) {
        current = supportUnits;
      } else if (/own|pr[oó]pri|home|eigen|casa|presentes/.test(label)) {
        current = ownUnits;
      }

      const tableUnits = parseUnitsFromUnitItems(table);

      if (Object.values(tableUnits).some(function (v) { return v > 0; })) {
        addDefenseUnits(current, tableUnits);
        found = true;
      }
    });

    if (!found) {
      return null;
    }

    return {
      ownUnits: ownUnits,
      supportUnits: supportUnits
    };
  }

  function parseMapInfoPayload(payload) {
    if (!payload) {
      return null;
    }

    if (payload.error) {
      return null;
    }

    if (payload.ownUnits && payload.supportUnits) {
      return {
        ownUnits: addDefenseUnits(emptyDefenseUnits(), payload.ownUnits),
        supportUnits: addDefenseUnits(emptyDefenseUnits(), payload.supportUnits)
      };
    }

    if (payload.units && typeof payload.units === "string") {
      return null;
    }

    if (Array.isArray(payload.unit_groups)) {
      const ownUnits = emptyDefenseUnits();
      const supportUnits = emptyDefenseUnits();
      const playerId = String(getPlayerId() || "");

      payload.unit_groups.forEach(function (group) {
        const target = String(group.player_id || group.owner_id || group.player) === playerId
          ? ownUnits
          : supportUnits;
        addDefenseUnits(target, group.units || group);
      });

      return {
        ownUnits: ownUnits,
        supportUnits: supportUnits
      };
    }

    if (payload.html) {
      return parsePlaceWithdrawHtml(payload.html) || parseInfoVillageHtml(payload.html);
    }

    if (typeof payload === "string") {
      return parsePlaceWithdrawHtml(payload) || parseInfoVillageHtml(payload);
    }

    return null;
  }

  function buildMapInfoUrl(villageId) {
    if (w.TWMap && w.TWMap.urls && w.TWMap.urls.villagePopup) {
      return w.TWMap.urls.villagePopup.replace(/__village__/g, villageId);
    }

    const sourceId = w.game_data && w.game_data.village ? w.game_data.village.id : villageId;
    const base = (w.game_data && w.game_data.link_base_pure) || ("/game.php?village=" + sourceId + "&screen=");

    return base + "overview&ajax=map_info&source=" + sourceId + "&village=" + villageId;
  }

  function buildPlaceWithdrawUrl(villageId) {
    const base = (w.game_data && w.game_data.link_base_pure) || ("/game.php?village=" + villageId + "&screen=");

    return base + "place&mode=withdraw&village=" + villageId;
  }

  function buildInfoVillageUrl(villageId) {
    const sourceId = w.game_data && w.game_data.village ? w.game_data.village.id : villageId;
    const base = (w.game_data && w.game_data.link_base_pure) || ("/game.php?village=" + sourceId + "&screen=");

    return base + "info_village&id=" + villageId;
  }

  function fetchGameUrl(url) {
    return new Promise(function (resolve, reject) {
      if (w.$ && w.$.get) {
        w.$.get(url).done(resolve).fail(reject);
        return;
      }

      fetch(url, { credentials: "same-origin" })
        .then(function (response) { return response.text(); })
        .then(resolve)
        .catch(reject);
    });
  }

  function tryParseJson(text) {
    try {
      return JSON.parse(text);
    } catch (err) {
      return null;
    }
  }

  function getVillageDefenseData(village) {
    const villageId = village.id;
    const urls = [
      buildPlaceWithdrawUrl(villageId),
      buildMapInfoUrl(villageId),
      buildInfoVillageUrl(villageId)
    ];

    function tryNext(index) {
      if (index >= urls.length) {
        return Promise.resolve(null);
      }

      return fetchGameUrl(urls[index]).then(function (response) {
        const json = typeof response === "string" ? tryParseJson(response) : null;
        const parsed = parseMapInfoPayload(json || response);

        if (parsed) {
          return parsed;
        }

        return tryNext(index + 1);
      }).catch(function () {
        return tryNext(index + 1);
      });
    }

    return tryNext(0);
  }

  function emptyAttackCounts() {
    return {
      total: 0,
      scout: 0,
      noble: 0,
      ram: 0,
      catapult: 0,
      small: 0,
      medium: 0,
      large: 0,
      unknown: 0,
      willBeDetectedByTower: 0,
      notDetectedByTower: 0,
      towerPending: 0,
      detectedRealAttack: 0
    };
  }

  function mergeAttackRow(target, row) {
    target.total += row.total || 0;

    [
      "scout", "noble", "ram", "catapult", "small", "medium", "large", "unknown",
      "willBeDetectedByTower", "notDetectedByTower", "towerPending", "detectedRealAttack"
    ].forEach(function (key) {
      target[key] += row[key] || 0;
    });
  }

  function isIncomingChegandoLabel(text) {
    const label = String(text || "").trim();

    return /^chegando(\s*\(\d+\))?$/i.test(label) || /^chegando\s*\(\d+\)/i.test(label);
  }

  function isNotDetectedByTowerText(text) {
    return /n[aã]o ser[aá] detectad|nao sera detectad|não será detectad|nicht.*erkannt|not be detected|won't be detected|nao.*detectad/.test(text);
  }

  function isTowerPendingText(text) {
    if (isNotDetectedByTowerText(text)) {
      return false;
    }

    return (
      /ser[aá] detectad|sera detectad|será detectad|will be detected|wird.*erkannt|detected by the watch|detectado pela torre|ataque ser[aá] detectad|ser[aá] detectado por uma torre de vigia|torre de vigia/.test(text)
    );
  }

  function rowHasCommandGraphic(rowHtml) {
    return /graphic\/(command|unit|unit_map)/.test(rowHtml);
  }

  function isIncomingCommandRow(row) {
    if (!row || row.querySelector("th")) {
      return false;
    }

    const rowHtml = (row.innerHTML || "").toLowerCase();
    const rowText = (row.innerText || "").trim();

    if (!rowText || rowText.length < 4) {
      return false;
    }

    if (isIncomingChegandoLabel(rowText)) {
      return false;
    }

    const hay = rowText.toLowerCase() + " " + rowHtml;
    const looksLikeCommand =
      /explorador|ataque|origin|chegada|snob|spy|unit_|command|graphic\/command|graphic\/unit/.test(hay);

    if (!rowHasCommandGraphic(rowHtml) && !looksLikeCommand) {
      return false;
    }

    return true;
  }

  function shouldIgnoreFarmOrReturnRow(rowText, rowHtml) {
    const text = String(rowText || "").toLowerCase();
    const html = String(rowHtml || "").toLowerCase();
    const hay = text + " " + html;

    if (/assistente de saque/.test(hay)) {
      return true;
    }

    if (/graphic\/command\/return|graphic\/unit\/return|\/return\.png|\/return\.webp/.test(hay)) {
      return true;
    }

    if (/\bretornando\b/.test(hay) || /\breturning\b/.test(hay)) {
      return true;
    }

    if (/\bretorno\b/.test(text) && !/\breturn\b/.test(text)) {
      return true;
    }

    if (/\bpilhagem\b/.test(hay)) {
      return true;
    }

    if (/aldeia de b[aá]rbaros/.test(hay)) {
      return true;
    }

    if (/\bfarm\b/.test(text) && (/assistente|saque|pilhagem/.test(hay))) {
      return true;
    }

    if (/\(\s*\d{3}\s*\|\s*\d{3}\s*\)[^|]{0,40}b[aá]rbar/.test(hay)) {
      return true;
    }

    return false;
  }

  function buildIncomingCommandCounts(row) {
    const counts = emptyAttackCounts();

    counts.total = 1;

    const rowText = (row.innerText || "").toLowerCase();
    const rowHtml = (row.innerHTML || "").toLowerCase();

    const imgData = Array.from(row.querySelectorAll("img")).map(function (img) {
      return (
        (img.getAttribute("src") || "") + " " +
        (img.getAttribute("title") || "") + " " +
        (img.getAttribute("alt") || "")
      ).toLowerCase();
    }).join(" ");

    const hayImg = imgData + " " + rowHtml;

    if (isNotDetectedByTowerText(rowText)) {
      counts.notDetectedByTower = 1;

      if (
        /unit_map\/spy|unit\/spy|unit_spy|graphic\/command\/spy|\/spy\.webp|\/spy\.png/.test(hayImg) ||
        /\bexplorador\b/.test(rowText)
      ) {
        counts.scout = 1;
      } else {
        counts.unknown = 1;
      }

      return counts;
    }

    if (isTowerPendingText(rowText)) {
      counts.towerPending = 1;
      counts.willBeDetectedByTower = 1;
      return counts;
    }

    if (
      /unit_map\/spy|unit\/spy|unit_spy|graphic\/command\/spy|\/spy\.webp|\/spy\.png/.test(hayImg) ||
      /\bexplorador\b/.test(rowText) ||
      /\bscout\b/.test(rowText)
    ) {
      counts.scout = 1;
      return counts;
    }

    if (
      /unit_map\/snob|unit\/snob|unit_snob|graphic\/command\/snob|\/snob\.webp|\/snob\.png/.test(hayImg) ||
      /\bnobres\b/.test(rowText) ||
      /ataque com nobre/.test(rowText)
    ) {
      counts.noble = 1;
      counts.detectedRealAttack = 1;
      return counts;
    }

    if (/\bram\b|unit_map\/ram|unit\/ram|unit_ram|\/ram\.webp|\/ram\.png|\bar[ií]ete\b/.test(hayImg + " " + rowText)) {
      counts.ram = 1;
      counts.detectedRealAttack = 1;
      return counts;
    }

    if (/catapult|unit_map\/catapult|unit_catapult|\/catapult\.webp|catapulta/.test(hayImg + " " + rowText)) {
      counts.catapult = 1;
      counts.detectedRealAttack = 1;
      return counts;
    }

    if (/attack_large|ataque grande|large attack|gro[ßs]er angriff/.test(hayImg + " " + rowText)) {
      counts.large = 1;
      counts.detectedRealAttack = 1;
      return counts;
    }

    if (/attack_medium|ataque m[ée]dio|medium attack|mittlerer/.test(hayImg + " " + rowText)) {
      counts.medium = 1;
      counts.detectedRealAttack = 1;
      return counts;
    }

    if (/attack_small|ataque pequeno|small attack|kleiner angriff/.test(hayImg + " " + rowText)) {
      counts.small = 1;
      counts.detectedRealAttack = 1;
      return counts;
    }

    if (/graphic\/command\/attack|graphic\/unit\/att|\/att\.webp|\/attack\.png/.test(hayImg)) {
      counts.unknown = 1;
      return counts;
    }

    counts.unknown = 1;

    return counts;
  }

  function classifiedRowToCounts(classified) {
    const counts = emptyAttackCounts();

    counts.total = 1;

    if (classified.scout) {
      counts.scout = 1;
    } else if (classified.noble) {
      counts.noble = 1;
      counts.detectedRealAttack = 1;
    } else if (classified.large) {
      counts.large = 1;
      counts.detectedRealAttack = 1;
    } else if (classified.medium) {
      counts.medium = 1;
      counts.detectedRealAttack = 1;
    } else if (classified.small) {
      counts.small = 1;
      counts.detectedRealAttack = 1;
    } else if (classified.notDetectedByTower) {
      counts.notDetectedByTower = 1;

      if (classified.scout) {
        counts.scout = 1;
      } else {
        counts.unknown = 1;
      }
    } else if (classified.towerPending) {
      counts.towerPending = 1;
      counts.willBeDetectedByTower = 1;
    } else if (classified.ram) {
      counts.ram = 1;
      counts.detectedRealAttack = 1;
    } else if (classified.catapult) {
      counts.catapult = 1;
      counts.detectedRealAttack = 1;
    } else {
      counts.unknown = 1;
    }

    return counts;
  }

  function classifyIncomingCommandRow(row, targetCoord) {
    const rowTextRaw = row.innerText || row.textContent || "";
    const rowText = rowTextRaw.toLowerCase();
    const rowHtml = (row.innerHTML || "").toLowerCase();
    const hay = rowText + " " + rowHtml;

    if (shouldIgnoreFarmOrReturnRow(rowText, rowHtml)) {
      return {
        ignored: true,
        ignoreReason: "farm_or_own_command"
      };
    }

    const originCoord = extractOriginCoordFromIncomingRow(
      rowTextRaw,
      row.innerHTML || "",
      targetCoord
    );

    if (originCoord && isOwnCoord(originCoord)) {
      return {
        ignored: true,
        ignoreReason: "own_origin",
        originCoord: originCoord
      };
    }

    const result = {
      ignored: false,
      type: "unknown",
      originCoord: originCoord,
      scout: false,
      noble: false,
      ram: false,
      catapult: false,
      small: false,
      medium: false,
      large: false,
      towerPending: false,
      notDetectedByTower: false
    };

    if (/explorador|spy|unit_spy|unit_map\/spy|graphic\/command\/spy|\/spy\./.test(hay)) {
      result.type = "scout";
      result.scout = true;
    } else if (
      /unit_map\/snob|unit\/snob|unit_snob|graphic\/command\/snob|\/snob\.|nobres\b|ataque com nobre/.test(hay)
    ) {
      result.type = "noble";
      result.noble = true;
    } else if (/ataque pequeno|attack_small|small attack/.test(rowText)) {
      result.type = "small";
      result.small = true;
    } else if (/ataque m[ée]dio|attack_medium|medium attack/.test(rowText)) {
      result.type = "medium";
      result.medium = true;
    } else if (/ataque grande|attack_large|large attack/.test(rowText)) {
      result.type = "large";
      result.large = true;
    }

    if (/ar[ií]ete|unit_ram|unit_map\/ram|\/ram\./.test(hay)) {
      result.ram = true;

      if (result.type === "unknown") {
        result.type = "ram";
      }
    }

    if (/catapulta|unit_catapult|unit_map\/catapult|catapult/.test(hay)) {
      result.catapult = true;

      if (result.type === "unknown") {
        result.type = "catapult";
      }
    }

    if (/n[aã]o ser[aá] detectad|nao sera detectad|not be detected/.test(rowText)) {
      result.notDetectedByTower = true;

      if (result.type === "unknown") {
        result.type = "notDetectedByTower";
      }
    } else if (/ser[aá] detectad|sera detectad|torre de vigia|will be detected/.test(rowText)) {
      result.towerPending = true;

      if (result.type === "unknown") {
        result.type = "towerPending";
      }
    }

    result.counts = classifiedRowToCounts(result);

    return result;
  }

  function getPrimaryAttackType(counts) {
    if (counts.scout > 0) {
      return "scout";
    }

    if (counts.noble > 0) {
      return "noble";
    }

    if (counts.ram > 0) {
      return "ram";
    }

    if (counts.catapult > 0) {
      return "catapult";
    }

    if (counts.large > 0) {
      return "large";
    }

    if (counts.medium > 0) {
      return "medium";
    }

    if (counts.small > 0) {
      return "small";
    }

    if (counts.notDetectedByTower > 0) {
      return "notDetectedByTower";
    }

    if (counts.towerPending > 0) {
      return "towerPending";
    }

    return "unknown";
  }

  function extractOriginCoordFromIncomingRow(rowText, rowHtml, targetCoord) {
    const targetKey = keyOf(targetCoord);
    const text = String(rowText || "");
    const html = String(rowHtml || "");

    const originSegment = text.match(/origin[\s\S]{0,160}/i);

    if (originSegment) {
      const parenCoord = originSegment[0].match(/\(\s*(\d{3})\s*\|\s*(\d{3})\s*\)/);

      if (parenCoord) {
        const coord = parenCoord[1] + "|" + parenCoord[2];

        if (keyOf(coord) !== targetKey) {
          return coord;
        }
      }

      const inlineCoord = originSegment[0].match(/(\d{3})\s*\|\s*(\d{3})/);

      if (inlineCoord) {
        const coord = inlineCoord[1] + "|" + inlineCoord[2];

        if (keyOf(coord) !== targetKey) {
          return coord;
        }
      }
    }

    const found = [];
    const coordPattern = /(\d{3})\s*\|\s*(\d{3})/g;
    let coordMatch;

    while ((coordMatch = coordPattern.exec(text)) !== null) {
      const coord = coordMatch[1] + "|" + coordMatch[2];

      if (keyOf(coord) !== targetKey) {
        found.push(coord);
      }
    }

    const linkDoc = document.createElement("div");

    linkDoc.innerHTML = html;

    linkDoc.querySelectorAll("a").forEach(function (link) {
      const combined = (link.textContent || "") + " " + (link.getAttribute("href") || "");
      let linkMatch;

      coordPattern.lastIndex = 0;

      while ((linkMatch = coordPattern.exec(combined)) !== null) {
        const coord = linkMatch[1] + "|" + linkMatch[2];

        if (keyOf(coord) !== targetKey) {
          found.push(coord);
        }
      }
    });

    if (found.length) {
      return found[0];
    }

    return null;
  }

  function findIncomingCommandRows(doc) {
    const rows = [];
    const seen = new WeakSet();

    function addRow(tr) {
      if (!tr || seen.has(tr)) {
        return;
      }

      seen.add(tr);
      rows.push(tr);
    }

    if (!doc) {
      return rows;
    }

    Array.from(doc.querySelectorAll("table")).forEach(function (table) {
      const text = table.innerText || "";

      if (!/Chegando\s*\(\d+\)/i.test(text) && !/^Chegando/i.test(text.trim())) {
        return;
      }

      Array.from(table.querySelectorAll("tr")).forEach(function (tr) {
        const rowText = (tr.innerText || tr.textContent || "").trim();
        const rowHtml = (tr.innerHTML || "").toLowerCase();

        if (!rowText) {
          return;
        }

        if (/^Chegando/i.test(rowText)) {
          return;
        }

        if (/Chegada em/i.test(rowText)) {
          return;
        }

        const looksLikeCommand =
          /explorador|ataque|origin|return|chegada|snob|nobre|spy|unit_|command|graphic\/command|graphic\/unit/.test(
            rowText + " " + rowHtml
          );

        if (looksLikeCommand) {
          addRow(tr);
        }
      });
    });

    if (!rows.length) {
      doc.querySelectorAll("h2, h3, h4, caption, th, label, span, div").forEach(function (el) {
        const label = (el.textContent || "").trim();

        if (!/Chegando\s*\(\d+\)/i.test(label) && !isIncomingChegandoLabel(label)) {
          return;
        }

        let table = el.closest("table");

        if (!table && el.nextElementSibling && el.nextElementSibling.tagName === "TABLE") {
          table = el.nextElementSibling;
        }

        if (!table && el.parentElement) {
          table = el.parentElement.querySelector("table");
        }

        if (table) {
          Array.from(table.querySelectorAll("tr")).forEach(function (tr) {
            const rowText = (tr.innerText || tr.textContent || "").trim();
            const rowHtml = (tr.innerHTML || "").toLowerCase();

            if (!rowText || /^Chegando/i.test(rowText) || /Chegada em/i.test(rowText)) {
              return;
            }

            if (/explorador|ataque|origin|return|chegada|snob|spy|unit_|command|graphic\/command|graphic\/unit/.test(rowText + " " + rowHtml)) {
              addRow(tr);
            }
          });
        }
      });
    }

    if (!rows.length) {
      const fallbackTable = doc.querySelector("#commands_incoming_table");

      if (fallbackTable) {
        getIncomingCommandRows(fallbackTable).forEach(addRow);
      }
    }

    return rows;
  }

  function findIncomingAttacksTable(doc) {
    let targetTable = null;
    const headerElements = doc.querySelectorAll("h2, h3, h4, caption, th");

    headerElements.forEach(function (el) {
      if (targetTable) {
        return;
      }

      const label = (el.textContent || "").trim();

      if (!isIncomingChegandoLabel(label)) {
        return;
      }

      let table = el.closest("table");

      if (!table && /^H[234]$/i.test(el.tagName)) {
        let sibling = el.nextElementSibling;

        while (sibling && !table) {
          if (sibling.tagName === "TABLE") {
            table = sibling;
            break;
          }

          sibling = sibling.nextElementSibling;
        }
      }

      if (table) {
        targetTable = table;
      }
    });

    if (!targetTable) {
      targetTable = doc.querySelector("#commands_incoming_table");
    }

    return targetTable;
  }

  function getIncomingCommandRows(table) {
    const rows = [];

    if (!table) {
      return rows;
    }

    table.querySelectorAll("tr").forEach(function (row) {
      if (isIncomingCommandRow(row)) {
        rows.push(row);
      }
    });

    return rows;
  }

  function parseIncomingAttacksFromHtml(html, targetCoord) {
    const emptyResult = {
      counts: emptyAttackCounts(),
      sources: []
    };

    if (!html || typeof html !== "string") {
      return emptyResult;
    }

    const doc = parseHtmlDoc(html);

    let rows = findIncomingCommandRows(doc);

    if (!rows.length) {
      const table = findIncomingAttacksTable(doc);

      rows = getIncomingCommandRows(table);
    }

    const result = {
      counts: emptyAttackCounts(),
      sources: []
    };

    if (!rows.length) {
      if (DEBUG_ATTACK_PARSER && targetCoord) {
        console.log("[AttackParser]", targetCoord, {
          incomingRows: 0,
          attackData: emptyResult.counts,
          rowsText: [],
          note: "tabela Chegando nao encontrada"
        });
      }

      return emptyResult;
    }

    let ignoredRows = 0;

    rows.forEach(function (row) {
      const rowText = (row.innerText || row.textContent || "").trim();
      const classified = classifyIncomingCommandRow(row, targetCoord);

      if (DEBUG_ATTACK_PARSER && targetCoord) {
        console.log("[AttackParserRow]", {
          targetCoord: targetCoord,
          rowText: rowText,
          originCoord: classified.originCoord || null,
          isOwnOrigin: classified.originCoord ? isOwnCoord(classified.originCoord) : false,
          ignored: !!classified.ignored,
          ignoreReason: classified.ignoreReason || null,
          type: classified.type || null
        });
      }

      if (!classified || classified.ignored) {
        ignoredRows += 1;
        return;
      }

      mergeAttackRow(result.counts, classified.counts);

      if (classified.originCoord && !isOwnCoord(classified.originCoord)) {
        result.sources.push({
          originCoord: classified.originCoord,
          attackType: classified.type
        });
      }
    });

    if (DEBUG_ATTACK_PARSER && targetCoord) {
      console.log("[AttackParser]", targetCoord, {
        incomingRows: rows.length,
        ignoredRows: ignoredRows,
        attackData: result.counts,
        rowsText: rows.map(function (row) {
          return (row.innerText || row.textContent || "").trim();
        })
      });
    }

    return result;
  }

  function buildEmptyVillageAttackData(coord) {
    const data = buildAttackResult(coord || "000|000", emptyAttackCounts());

    data.coord = coord || null;

    return data;
  }

  async function getVillageAttackDataByVillageRef(item) {
    const villageId = String(item.villageId || item.id || "");

    if (!villageId) {
      return buildEmptyVillageAttackData(item.coord);
    }

    const response = await fetchGameUrl(buildInfoVillageUrl(villageId));
    const doc = parseHtmlDoc(response);
    let coord = item.coord || extractTargetCoordFromInfoVillageHtml(response);

    if (!coord) {
      const nameMatch = String(item.name || "").match(/(\d{3})\s*\|\s*(\d{3})/);

      if (nameMatch) {
        coord = nameMatch[1] + "|" + nameMatch[2];
      }
    }

    const rows = findIncomingCommandRows(doc);
    const parsed = parseIncomingAttacksFromHtml(response, coord);
    const raw = parsed.counts;

    let data;

    if (!coord) {
      data = buildEmptyVillageAttackData(null);
      data.total = raw.total;
      Object.assign(data, raw);
    } else if (raw.total > 0) {
      processIncomingAttackSources(coord, parsed);
      data = buildAttackResult(coord, raw);
      data.coord = coord;
    } else {
      data = buildEmptyVillageAttackData(coord);
    }

    if (DEBUG_ATTACK_PARSER) {
      console.log("[AttackParserVillage]", {
        item: item,
        coord: data && data.coord,
        rows: rows.length,
        attackData: data
      });
    }

    return data;
  }

  function getVillageIncomingAttacks(village, targetCoord) {
    return fetchGameUrl(buildInfoVillageUrl(village.id)).then(function (response) {
      let coord = targetCoord || coordFromGameVillage(village);

      if (!coord) {
        coord = extractTargetCoordFromInfoVillageHtml(response);
      }

      return parseIncomingAttacksFromHtml(response, coord);
    });
  }

  function findAttackersGroup() {
    for (const group of Object.values(groups)) {
      if (group.systemType === "attackers") {
        return group;
      }
    }

    return null;
  }

  function getOrCreateAttackersGroup() {
    let group = findAttackersGroup();

    if (group) {
      return group;
    }

    group = {
      id: ATTACKERS_GROUP_ID,
      name: "Aldeias atacantes",
      color: "#ff0000",
      text: "",
      icon: "axe",
      note: "Grupo automático com aldeias que estão atacando aldeias próprias.",
      coordInputDraft: "",
      coords: {},
      attackerCounts: {},
      systemType: "attackers"
    };

    groups[group.id] = group;

    if (!document.getElementById("twm_panel_" + group.id)) {
      createGroupPanel(group);
    }

    refreshAllPanels();

    return group;
  }

  function registerAttackerSource(originCoord, targetCoord, attackType) {
    if (!originCoord || isOwnCoord(originCoord)) {
      return;
    }

    if (attackType === "ignored") {
      return;
    }

    const group = getOrCreateAttackersGroup();

    group.coords[originCoord] = 1;

    if (!attackerSourceResults[originCoord]) {
      attackerSourceResults[originCoord] = {
        coord: originCoord,
        count: 0,
        targets: {},
        types: {
          scout: 0,
          unknown: 0,
          noble: 0,
          ram: 0,
          catapult: 0,
          large: 0,
          medium: 0,
          small: 0,
          towerPending: 0,
          notDetectedByTower: 0
        }
      };
    }

    const item = attackerSourceResults[originCoord];

    item.count += 1;
    item.targets[targetCoord] = (item.targets[targetCoord] || 0) + 1;

    if (attackType && item.types[attackType] != null) {
      item.types[attackType] += 1;
    } else {
      item.types.unknown += 1;
    }

    group.attackerCounts = group.attackerCounts || {};
    group.attackerCounts[originCoord] = item.count;
  }

  function clearAttackerSourceResults() {
    attackerSourceResults = {};

    const group = findAttackersGroup();

    if (group) {
      group.coords = {};
      group.attackerCounts = {};
    }

    document.querySelectorAll(".twm_attacker_source_mark").forEach(function (el) {
      el.remove();
    });

    refreshAttackTargetSelect();
  }

  function processIncomingAttackSources(targetCoord, parsed) {
    if (!parsed || !parsed.sources) {
      return;
    }

    parsed.sources.forEach(function (source) {
      registerAttackerSource(source.originCoord, targetCoord, source.attackType);
    });
  }

  function formatAttackerSourceTitle(coord) {
    const item = attackerSourceResults[coord];

    if (!item) {
      return coord;
    }

    const lines = [
      "Aldeia atacante: " + coord,
      "Ataques saindo: " + item.count,
      "",
      "Alvos:"
    ];

    Object.keys(item.targets).forEach(function (target) {
      lines.push(target + ": " + item.targets[target]);
    });

    lines.push("");
    lines.push("Tipos:");

    Object.keys(item.types).forEach(function (type) {
      lines.push(type + ": " + item.types[type]);
    });

    return lines.join("\n");
  }

  function formatAttackerSourceText(coord) {
    const item = attackerSourceResults[coord];

    if (!item) {
      return "ATK";
    }

    return "ATK\n" + item.count;
  }

  function populateAttackerSourceContent(container, coord) {
    const item = attackerSourceResults[coord];

    if (!item) {
      return;
    }

    container.innerHTML = "";

    const span = document.createElement("span");

    span.className = "twm_mark_attacker";
    span.textContent = formatAttackerSourceText(coord);
    span.style.cssText =
      "font-size:8px;" +
      "line-height:8px;" +
      "white-space:pre-line;" +
      "font-weight:bold;" +
      "color:#fff;" +
      "text-shadow:1px 1px 2px #000,-1px -1px 2px #000;" +
      "text-align:center;" +
      "max-width:100%;" +
      "overflow:hidden;";

    container.appendChild(span);
  }

  function getDefenseDataForRisk(coord) {
    const defense = defenseResults[coord];

    if (!defense || defense.ownFull == null || defense.supportFull == null) {
      return null;
    }

    return {
      ownFull: Number(defense.ownFull),
      supportFull: Number(defense.supportFull),
      totalFull: Number(defense.ownFull) + Number(defense.supportFull)
    };
  }

  function calculateAttackRisk(coord, attackData, defenseData) {
    if (!attackData || !attackData.total) {
      return "baixo";
    }

    const scout = Number(attackData.scout || 0);
    const noble = Number(attackData.noble || 0);
    const large = Number(attackData.large || 0);
    const medium = Number(attackData.medium || 0);
    const small = Number(attackData.small || 0);
    const unknown = Number(attackData.unknown || 0);
    const towerPending = Number(attackData.towerPending || attackData.willBeDetectedByTower || 0);
    const notDetectedByTower = Number(attackData.notDetectedByTower || 0);

    const realAttacks = large + medium + small + noble;
    const total = Number(attackData.total || 0);

    if (scout > 0 && scout === total && realAttacks === 0 && unknown === 0 && towerPending === 0) {
      return "scout";
    }

    if (noble > 0) {
      return "critico";
    }

    if (notDetectedByTower > 0) {
      return "alto";
    }

    if (realAttacks === 0 && scout > 0 && unknown === 0 && towerPending === 0) {
      return "scout";
    }

    if (realAttacks === 0 && towerPending > 0) {
      return "aguardando";
    }

    if (realAttacks === 0 && unknown > 0) {
      return "incerto";
    }

    const totalDefense = defenseData
      ? Number(defenseData.ownFull || 0) + Number(defenseData.supportFull || 0)
      : null;

    if (totalDefense != null && realAttacks > 0) {
      const attackWeight =
        large +
        medium * 0.5 +
        small * 0.25 +
        unknown * 0.5 +
        towerPending * 0.3;

      if (attackWeight > totalDefense * 1.5) {
        return "critico";
      }

      if (attackWeight > totalDefense) {
        return "alto";
      }

      if (attackWeight >= totalDefense * 0.7) {
        return "medio";
      }

      return "baixo";
    }

    if (large > 0) {
      return "alto";
    }

    if (medium > 0) {
      return "medio";
    }

    if (small > 0) {
      return "baixo";
    }

    if (towerPending > 0) {
      return "aguardando";
    }

    if (unknown > 0) {
      return "incerto";
    }

    if (scout > 0) {
      return "scout";
    }

    return "baixo";
  }

  function buildAttackResult(coord, rawCounts) {
    const defenseData = defenseResults[coord] || getDefenseDataForRisk(coord);
    const result = Object.assign({}, rawCounts);

    result.noDefenseData = !defenseData || defenseData.ownFull == null || defenseData.supportFull == null;
    result.risk = calculateAttackRisk(coord, result, defenseData);

    return result;
  }

  function formatRiskLabel(risk) {
    const labels = {
      scout: "SCOUT",
      aguardando: "TORRE",
      incerto: "INCERTO",
      baixo: "BAIXO",
      medio: "MEDIO",
      alto: "ALTO",
      critico: "CRITICO"
    };

    return labels[risk] || "???";
  }

  function getAttackRiskColor(attack) {
    if (!attack) {
      return ATTACK_RISK_COLORS.incerto;
    }

    return ATTACK_RISK_COLORS[attack.risk] || ATTACK_RISK_COLORS.incerto;
  }

  function formatAttackText(attack, defense) {
    if (attack.risk === "scout") {
      return "S:" + attack.scout + "\nR:SCOUT";
    }

    if (attack.risk === "aguardando") {
      return "A:" + attack.total + "\nR:TORRE";
    }

    if (attack.risk === "incerto") {
      return "A:" + attack.total + "\nR:INCERTO";
    }

    const lines = ["A:" + attack.total];

    if (defense && defense.ownFull != null && defense.supportFull != null) {
      lines.push("D:" + (Number(defense.ownFull) + Number(defense.supportFull)).toFixed(1));
    } else if (attack.noDefenseData) {
      lines.push("D:-");
    }

    lines.push("R:" + formatRiskLabel(attack.risk));

    return lines.join("\n");
  }

  function formatAttackTitle(coord, attack, defense) {
    const parts = [
      coord,
      "Ataques: " + attack.total,
      "Scout: " + attack.scout,
      "Unknown: " + attack.unknown,
      "Nobre: " + attack.noble,
      "Aguardando torre: " + (attack.towerPending || attack.willBeDetectedByTower || 0),
      "Fora torre: " + attack.notDetectedByTower,
      "Reais detectados: " + (attack.detectedRealAttack || 0)
    ];

    if (defense && defense.ownFull != null && defense.supportFull != null) {
      parts.push(
        "Defesa total: " +
        (Number(defense.ownFull) + Number(defense.supportFull)).toFixed(1)
      );
    } else if (attack.noDefenseData) {
      parts.push("Sem dados de defesa");
    }

    parts.push("Risco: " + formatRiskLabel(attack.risk));

    return parts.join(" | ");
  }

  function populateAttackContent(container, attack, defense) {
    container.innerHTML = "";

    const span = document.createElement("span");

    span.className = "twm_mark_attack";
    span.textContent = formatAttackText(attack, defense);
    span.style.cssText =
      "font-size:8px;" +
      "line-height:8px;" +
      "white-space:pre-line;" +
      "font-weight:bold;" +
      "color:#fff;" +
      "text-shadow:1px 1px 2px #000,-1px -1px 2px #000;" +
      "text-align:center;" +
      "max-width:100%;" +
      "overflow:hidden;";

    container.appendChild(span);
  }

  function calculateDefenseFulls(data) {
    if (!data || !data.ownUnits || !data.supportUnits) {
      return {
        ownFull: null,
        supportFull: null,
        error: "Não foi possível separar tropas próprias e apoio"
      };
    }

    function sumFull(units) {
      return (
        (units.spear || 0) / 12000 +
        (units.sword || 0) / 12000 +
        (units.archer || 0) / 12000 +
        (units.heavy || 0) / 8000
      );
    }

    const ownFullRaw = sumFull(data.ownUnits);
    const supportFullRaw = sumFull(data.supportUnits);

    return {
      ownFull: Math.min(1, ownFullRaw),
      supportFull: supportFullRaw,
      ownUnits: data.ownUnits,
      supportUnits: data.supportUnits
    };
  }

  function formatDefenseNumber(value) {
    const n = Math.round(Number(value) * 10) / 10;
    return (n % 1 === 0 ? String(n.toFixed(0)) : String(n));
  }

  function findGroupByCoord(coord) {
    for (const group of Object.values(groups)) {
      if (group.coords && group.coords[coord]) {
        return group;
      }
    }

    return null;
  }

  function formatDefenseText(result) {
    if (!result) {
      return "";
    }

    const ownValue = result.ownFull != null ? Number(result.ownFull) : 0;
    const outsideValue = result.supportFull != null ? Number(result.supportFull) : 0;
    const totalValue = ownValue + outsideValue;

    const p = result.ownFull != null ? ownValue.toFixed(1) : "-";
    const f = result.supportFull != null ? outsideValue.toFixed(1) : "-";
    const t = result.ownFull != null || result.supportFull != null ? totalValue.toFixed(1) : "-";

    return "P:" + p + "\nF:" + f + "\nT:" + t;
  }

  function formatDefenseTitle(result) {
    if (!result) {
      return "";
    }

    const ownValue = result.ownFull != null ? Number(result.ownFull) : 0;
    const outsideValue = result.supportFull != null ? Number(result.supportFull) : 0;
    const totalValue = ownValue + outsideValue;

    const p = result.ownFull != null ? ownValue.toFixed(1) : "-";
    const f = result.supportFull != null ? outsideValue.toFixed(1) : "-";
    const t = result.ownFull != null || result.supportFull != null ? totalValue.toFixed(1) : "-";

    return "P: " + p + " | F: " + f + " | T: " + t;
  }

  function populateDefenseContent(container, result) {
    container.innerHTML = "";

    const span = document.createElement("span");

    span.className = "twm_mark_defense";
    span.textContent = formatDefenseText(result);
    span.style.cssText =
      "font-size:8px;" +
      "line-height:8px;" +
      "white-space:pre-line;" +
      "font-weight:bold;" +
      "color:#fff;" +
      "text-shadow:1px 1px 2px #000,-1px -1px 2px #000;" +
      "text-align:center;" +
      "max-width:100%;" +
      "overflow:hidden;";

    container.appendChild(span);
  }

  function countDefenseResults() {
    return Object.keys(defenseResults).length;
  }

  function clearAllDefense() {
    defenseResults = {};
    draw();
    setDefenseStatus("Defesa limpa.");
  }

  function countAttackResults() {
    return Object.keys(attackResults).length;
  }

  function clearAllAttacks() {
    attackResults = {};
    clearAttackerSourceResults();
    clearAttackOverlays();
    refreshAttackTargetSelect();
    draw();
    setAttackStatus("Ataques limpos.");
  }

  function setAttackStatus(message, isError) {
    const el = document.getElementById("twm_attack_status");

    if (!el) {
      return;
    }

    el.textContent = message || "";
    el.style.color = isError ? "#7a0000" : "#333";
  }

  function updateAttackInfo() {
    const info = document.getElementById("twm_attack_info");

    if (!info) {
      return;
    }

    info.textContent = "Ataques: " + countAttackResults() + " aldeia(s) mapeada(s)";
  }

  function updateAttackButtons() {
    const cancelBtn = document.getElementById("twm_cancel_attack");
    const mapBtn = document.getElementById("twm_map_attacks");

    if (cancelBtn) {
      cancelBtn.disabled = !attackMappingInProgress;
    }

    if (mapBtn) {
      mapBtn.disabled = attackMappingInProgress;
    }
  }

  function refreshAttackTargetSelect() {
    const select = document.getElementById("twm_attack_target_select");

    if (!select) {
      return;
    }

    const currentValue = select.value;

    select.innerHTML = "";

    const allOpt = document.createElement("option");

    allOpt.value = ATTACK_ALL_OWN;
    allOpt.textContent = "Todas as aldeias próprias";
    select.appendChild(allOpt);

    Object.values(groups).forEach(function (group) {
      if (group.systemType === "attackers") {
        return;
      }

      const opt = document.createElement("option");

      opt.value = group.id;
      opt.textContent = group.name + " (" + Object.keys(group.coords || {}).length + ")";
      select.appendChild(opt);
    });

    if (currentValue && (currentValue === ATTACK_ALL_OWN || groups[currentValue])) {
      select.value = currentValue;
    } else {
      select.value = ATTACK_ALL_OWN;
    }
  }

  function cancelAttackMapping() {
    attackMappingCancelled = true;
    attackMappingInProgress = false;
    w.__twm_attack_cancel = null;

    if (w.__twm_attack_mapping_timer) {
      clearTimeout(w.__twm_attack_mapping_timer);
      w.__twm_attack_mapping_timer = null;
    }

    updateAttackButtons();
    updateAttackInfo();
    setAttackStatus("Mapeamento de ataques cancelado.");
  }

  function clearAttackOverlays() {
    document.querySelectorAll(".twm_attack_mark").forEach(function (mark) {
      mark.remove();
    });
  }

  function drawStandaloneAttackOverlay(coord, attack) {
    const village = w.TWMap.villages[keyOf(coord)];

    if (!village || !village.id || !attack || !attack.total) {
      return;
    }

    if (findGroupByCoord(coord)) {
      return;
    }

    const img = document.getElementById("map_village_" + village.id);

    if (!img || !img.parentElement) {
      return;
    }

    const parent = img.parentElement;
    const defense = defenseResults[coord];
    const riskColor = getAttackRiskColor(attack);

    if (getComputedStyle(parent).position === "static") {
      parent.style.position = "relative";
    }

    const box = document.createElement("div");

    box.className = "twm_attack_mark";
    box.dataset.coord = coord;
    box.title = formatAttackTitle(coord, attack, defense);

    const left = img.style.left || img.offsetLeft + "px";
    const top = img.style.top || img.offsetTop + "px";
    const width = img.style.width || img.width + "px";
    const height = img.style.height || img.height + "px";

    let z = parseInt(img.style.zIndex || getComputedStyle(img).zIndex || 5, 10);

    if (isNaN(z)) {
      z = 5;
    }

    box.style.cssText =
      "position:absolute;" +
      "left:" + left + ";" +
      "top:" + top + ";" +
      "width:" + width + ";" +
      "height:" + height + ";" +
      "box-sizing:border-box;" +
      "border:2px solid " + riskColor + ";" +
      "background:" + alpha(riskColor, 0.72) + ";" +
      "border-radius:3px;" +
      "z-index:" + (z + 65) + ";" +
      "pointer-events:none;" +
      "display:flex;" +
      "align-items:center;" +
      "justify-content:center;" +
      "overflow:hidden;" +
      "padding:1px;";

    populateAttackContent(box, attack, defense);

    parent.appendChild(box);
  }

  function drawStandaloneAttackOverlays() {
    Object.keys(attackResults).forEach(function (coord) {
      const attack = attackResults[coord];

      if (attack && attack.total > 0 && !findGroupByCoord(coord)) {
        drawStandaloneAttackOverlay(coord, attack);
      }
    });
  }

  async function mapAttacksForSelectedTarget() {
    if (attackMappingInProgress) {
      setAttackStatus("Mapeamento de ataques já em andamento.", true);
      return;
    }

    const select = document.getElementById("twm_attack_target_select");
    const value = select ? select.value : ATTACK_ALL_OWN;

    if (value === ATTACK_ALL_OWN) {
      await mapAttacksForAllOwnVillages();
      return;
    }

    const group = groups[value];

    if (!group || group.systemType === "attackers") {
      setAttackStatus("Selecione um grupo ou Todas as aldeias próprias.", true);
      return;
    }

    await mapAttacksForGroup(group);
  }

  async function mapAttacksForAllOwnVillages() {
    const ownVillages = await getAllOwnVillagesForAttackMapping();

    if (!ownVillages.length) {
      setAttackStatus("Nenhuma aldeia própria encontrada para mapear ataques.", true);
      return;
    }

    attackResults = {};
    clearAttackerSourceResults();

    attackMappingCancelled = false;
    attackMappingInProgress = true;
    updateAttackButtons();
    w.__twm_attack_cancel = cancelAttackMapping;

    let checked = 0;
    let withIncoming = 0;
    let failed = 0;
    let origins = 0;

    setAttackStatus("Mapeando ataques em todas as aldeias próprias...");

    for (let i = 0; i < ownVillages.length; i++) {
      if (attackMappingCancelled) {
        break;
      }

      const item = ownVillages[i];

      try {
        const data = await getVillageAttackDataByVillageRef(item);

        checked++;

        if (!data || !data.total) {
          if (data && data.coord && attackResults[data.coord]) {
            delete attackResults[data.coord];
          }

          setAttackStatus("Mapeando ataques " + checked + "/" + ownVillages.length + " | sem ataques");
          await sleep(250);
          continue;
        }

        if (!data.coord) {
          setAttackStatus("Mapeando ataques " + checked + "/" + ownVillages.length + " | sem coordenada");
          await sleep(250);
          continue;
        }

        data.risk = calculateAttackRisk(data.coord, data, defenseResults[data.coord]);
        attackResults[data.coord] = data;
        withIncoming++;

        origins = Object.keys(attackerSourceResults || {}).length;

        draw();

        setAttackStatus(
          "Mapeando ataques " +
          checked +
          "/" +
          ownVillages.length +
          " | ataques em " +
          data.coord +
          " | origens: " +
          origins
        );

        if (attackMappingCancelled) {
          break;
        }

        await sleep(ATTACK_FETCH_DELAY);
      } catch (err) {
        failed++;
        console.error("Erro ao mapear ataques:", item, err);
      }
    }

    attackMappingInProgress = false;
    w.__twm_attack_cancel = null;
    w.__twm_attack_mapping_timer = null;
    updateAttackButtons();
    updateAttackInfo();
    refreshAllPanels();
    draw();

    if (attackMappingCancelled) {
      setAttackStatus(
        "Mapeamento cancelado. Verificadas: " +
        checked +
        " | Com ataques: " +
        withIncoming +
        " | Origens: " +
        origins +
        " | Falhas: " +
        failed
      );
    } else {
      setAttackStatus(
        "Mapeamento concluído. Verificadas: " +
        checked +
        " | Com ataques: " +
        withIncoming +
        " | Origens: " +
        origins +
        " | Falhas: " +
        failed
      );
    }
  }

  async function mapAttacksForGroup(group) {
    if (!group || !group.coords) {
      setAttackStatus("Grupo inválido para mapear ataques.", true);
      return;
    }

    const coords = Object.keys(group.coords);

    if (!coords.length) {
      setAttackStatus("O grupo " + group.name + " não tem aldeias.", true);
      return;
    }

    attackResults = {};
    clearAttackerSourceResults();

    attackMappingCancelled = false;
    attackMappingInProgress = true;
    updateAttackButtons();
    w.__twm_attack_cancel = cancelAttackMapping;

    let checked = 0;
    let withIncoming = 0;
    let failed = 0;
    let skipped = 0;
    let origins = 0;

    setAttackStatus("Mapeando ataques do grupo " + group.name + "...");

    for (let i = 0; i < coords.length; i++) {
      if (attackMappingCancelled) {
        break;
      }

      const coord = coords[i];
      const villageId = findVillageIdByCoord(coord);

      if (!villageId) {
        skipped++;
        setAttackStatus(
          "Mapeando " + group.name + " " + (i + 1) + "/" + coords.length +
          " | sem villageId: " + coord
        );
        continue;
      }

      try {
        const data = await getVillageAttackDataByVillageRef({
          villageId: villageId,
          coord: coord,
          name: coord
        });

        checked++;

        if (attackMappingCancelled) {
          break;
        }

        if (!data || !data.coord) {
          skipped++;
          setAttackStatus(
            "Mapeando ataques " + checked + "/" + coords.length + " | sem coordenada"
          );
          await sleep(250);
          continue;
        }

        if (!data.total) {
          if (attackResults[data.coord]) {
            delete attackResults[data.coord];
          }

          setAttackStatus(
            "Mapeando ataques " + checked + "/" + coords.length + " | sem ataques em " + data.coord
          );
          await sleep(250);
          continue;
        }

        data.risk = calculateAttackRisk(data.coord, data, defenseResults[data.coord]);
        attackResults[data.coord] = data;
        withIncoming++;

        origins = Object.keys(attackerSourceResults || {}).length;

        draw();

        setAttackStatus(
          "Mapeando ataques " +
          checked +
          "/" +
          coords.length +
          " | ataques em " +
          data.coord +
          " | origens: " +
          origins
        );

        if (attackMappingCancelled) {
          break;
        }

        await sleep(ATTACK_FETCH_DELAY);
      } catch (err) {
        failed++;
        console.error("Erro ao mapear ataques do grupo:", coord, err);
      }
    }

    attackMappingInProgress = false;
    w.__twm_attack_cancel = null;
    w.__twm_attack_mapping_timer = null;
    updateAttackButtons();
    updateAttackInfo();
    refreshAllPanels();
    draw();

    if (attackMappingCancelled) {
      setAttackStatus(
        "Mapeamento cancelado. Verificadas: " +
        checked +
        " | Com ataques: " +
        withIncoming +
        " | Origens: " +
        origins +
        " | Falhas: " +
        failed
      );
    } else {
      setAttackStatus(
        "Mapeamento concluído. Verificadas: " +
        checked +
        " | Com ataques: " +
        withIncoming +
        " | Origens: " +
        origins +
        " | Falhas: " +
        failed
      );
    }
  }

  function updateDefenseButtons() {
    const cancelBtn = document.getElementById("twm_cancel_defense");
    const mapBtn = document.getElementById("twm_map_group_defense");

    if (cancelBtn) {
      cancelBtn.disabled = !defenseMappingInProgress;
    }

    if (mapBtn) {
      mapBtn.disabled = defenseMappingInProgress;
    }
  }

  function refreshDefenseGroupSelect() {
    const select = document.getElementById("twm_defense_group_select");

    if (!select) {
      return;
    }

    const currentValue = select.value;

    select.innerHTML = "";

    const groupEntries = Object.values(groups);

    if (!groupEntries.length) {
      const opt = document.createElement("option");

      opt.value = "";
      opt.textContent = "Nenhum grupo";
      select.appendChild(opt);
      return;
    }

    groupEntries.forEach(function (group) {
      const opt = document.createElement("option");

      opt.value = group.id;
      opt.textContent = group.name + " (" + Object.keys(group.coords || {}).length + ")";
      select.appendChild(opt);
    });

    if (currentValue && groups[currentValue]) {
      select.value = currentValue;
    } else if (activeGroupId && groups[activeGroupId]) {
      select.value = activeGroupId;
    }
  }

  function cancelDefenseMapping() {
    defenseMappingCancelled = true;
    defenseMappingInProgress = false;
    w.__twm_defense_cancel = null;

    if (w.__twm_defense_mapping_timer) {
      clearTimeout(w.__twm_defense_mapping_timer);
      w.__twm_defense_mapping_timer = null;
    }

    updateDefenseButtons();
    updateDefenseInfo();
    setDefenseStatus("Mapeamento de defesa cancelado.");
  }

  function clearDefenseOverlays() {
    document.querySelectorAll(".twm_defense_mark").forEach(function (mark) {
      mark.remove();
    });
  }

  function drawStandaloneDefenseOverlay(coord, result) {
    const village = w.TWMap.villages[keyOf(coord)];

    if (!village || !village.id || result.ownFull == null || result.supportFull == null) {
      return;
    }

    if (findGroupByCoord(coord)) {
      return;
    }

    const img = document.getElementById("map_village_" + village.id);

    if (!img || !img.parentElement) {
      return;
    }

    const parent = img.parentElement;

    if (getComputedStyle(parent).position === "static") {
      parent.style.position = "relative";
    }

    const box = document.createElement("div");

    box.className = "twm_defense_mark";
    box.dataset.coord = coord;
    box.title = "Defesa " + coord + " | " + formatDefenseTitle(result);

    const left = img.style.left || img.offsetLeft + "px";
    const top = img.style.top || img.offsetTop + "px";
    const width = img.style.width || img.width + "px";
    const height = img.style.height || img.height + "px";

    let z = parseInt(img.style.zIndex || getComputedStyle(img).zIndex || 5, 10);

    if (isNaN(z)) {
      z = 5;
    }

    box.style.cssText =
      "position:absolute;" +
      "left:" + left + ";" +
      "top:" + top + ";" +
      "width:" + width + ";" +
      "height:" + height + ";" +
      "box-sizing:border-box;" +
      "border:1px solid #1f4f9a;" +
      "background:rgba(0,0,0,0.62);" +
      "border-radius:3px;" +
      "z-index:" + (z + 60) + ";" +
      "pointer-events:none;" +
      "display:flex;" +
      "align-items:center;" +
      "justify-content:center;" +
      "overflow:hidden;" +
      "padding:1px;";

    populateDefenseContent(box, result);

    parent.appendChild(box);
  }

  function drawStandaloneDefenseOverlays() {
    Object.keys(defenseResults).forEach(function (coord) {
      const attack = attackResults[coord];

      if (!findGroupByCoord(coord) && !(attack && attack.total > 0)) {
        drawStandaloneDefenseOverlay(coord, defenseResults[coord]);
      }
    });
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function sleep(ms) {
    return delay(ms);
  }

  async function mapDefenseForSelectedGroup() {
    if (defenseMappingInProgress) {
      setDefenseStatus("Mapeamento de defesa já em andamento.", true);
      return;
    }

    const select = document.getElementById("twm_defense_group_select");
    const groupId = select ? select.value : "";
    const group = groupId ? groups[groupId] : null;

    if (!group) {
      setDefenseStatus("Selecione um grupo para mapear defesa.", true);
      return;
    }

    await mapDefenseForGroup(group);
  }

  async function mapDefenseForGroup(group) {
    if (!group || !group.coords) {
      setDefenseStatus("Grupo inválido para mapear defesa.", true);
      return;
    }

    const coords = Object.keys(group.coords);

    if (!coords.length) {
      setDefenseStatus("O grupo " + group.name + " não tem aldeias.", true);
      return;
    }

    defenseMappingCancelled = false;
    defenseMappingInProgress = true;
    updateDefenseButtons();
    w.__twm_defense_cancel = cancelDefenseMapping;

    let mapped = 0;
    let skipped = 0;
    let failed = 0;

    setDefenseStatus("Mapeando defesa do grupo " + group.name + "...");

    for (let i = 0; i < coords.length; i++) {
      if (defenseMappingCancelled) {
        break;
      }

      const coord = coords[i];
      const village = w.TWMap.villages[keyOf(coord)];

      if (!village || !village.id) {
        skipped++;
        setDefenseStatus(
          "Mapeando " + group.name + " " + (i + 1) + "/" + coords.length +
          " | fora da área visível: " + coord
        );
        continue;
      }

      try {
        const data = await getVillageDefenseData(village);

        if (defenseMappingCancelled) {
          break;
        }

        if (!data || !canSeparateDefenseData(data)) {
          failed++;
          setDefenseStatus(
            "Sem dados separados em " + coord + " (" + (i + 1) + "/" + coords.length + ")"
          );
          continue;
        }

        const result = calculateDefenseFulls(data);

        if (!result || result.ownFull == null || result.supportFull == null) {
          failed++;
          continue;
        }

        defenseResults[coord] = result;
        mapped++;
        draw();

        setDefenseStatus(
          "Mapeando " + group.name + " " + (i + 1) + "/" + coords.length + " | OK: " + coord
        );

        if (defenseMappingCancelled) {
          break;
        }

        await sleep(DEFENSE_FETCH_DELAY);
      } catch (err) {
        failed++;
        console.error("Erro ao mapear defesa do grupo:", coord, err);
      }
    }

    defenseMappingInProgress = false;
    w.__twm_defense_cancel = null;
    w.__twm_defense_mapping_timer = null;
    updateDefenseButtons();
    updateDefenseInfo();
    draw();

    if (defenseMappingCancelled) {
      setDefenseStatus(
        "Mapeamento cancelado. Grupo: " + group.name +
        " | OK: " + mapped +
        " | Falhas: " + failed +
        " | Fora da tela: " + skipped
      );
    } else {
      setDefenseStatus(
        "Mapeamento concluído. Grupo: " + group.name +
        " | OK: " + mapped +
        " | Falhas: " + failed +
        " | Fora da tela: " + skipped
      );
    }
  }

  function canSeparateDefenseData(data) {
    return !!(data && data.ownUnits && data.supportUnits);
  }

  function getEffectiveIcon(group) {
    return String(group.icon || "").trim();
  }

  function getTextFontSize(text) {
    const len = String(text || "").length;

    if (len <= 2) {
      return "14px";
    }

    if (len <= 4) {
      return "11px";
    }

    return "9px";
  }

  function addMarkTextSpan(container, text) {
    const span = document.createElement("span");

    span.className = "twm_mark_text";
    span.textContent = text;
    span.style.cssText =
      "font-weight:bold;" +
      "color:#fff;" +
      "text-shadow:1px 1px 2px #000,-1px -1px 2px #000;" +
      "max-width:100%;" +
      "overflow:hidden;" +
      "white-space:nowrap;" +
      "text-overflow:ellipsis;" +
      "line-height:1;" +
      "font-size:" + getTextFontSize(text) + ";";

    container.appendChild(span);
  }

  function populateMarkContent(container, group) {
    container.innerHTML = "";

    const text = String(group.text || "").trim();
    const iconValue = getEffectiveIcon(group);
    const candidates = iconCandidates(iconValue);
    const hasText = text.length > 0;
    const hasIcon = candidates.length > 0;

    if (!hasText && !hasIcon) {
      return;
    }

    const content = document.createElement("div");

    content.className = "twm_mark_content";
    content.style.cssText =
      "display:flex;" +
      "flex-direction:column;" +
      "align-items:center;" +
      "justify-content:center;" +
      "gap:1px;" +
      "width:100%;" +
      "height:100%;" +
      "padding:1px;" +
      "box-sizing:border-box;";

    if (hasIcon) {
      const iconImg = document.createElement("img");
      let index = 0;

      iconImg.className = "twm_mark_icon";
      iconImg.alt = text || group.name || "";
      iconImg.style.cssText =
        "max-width:18px;" +
        "max-height:14px;" +
        "width:auto;" +
        "height:auto;" +
        "pointer-events:none;" +
        "flex-shrink:0;";

      iconImg.onerror = function () {
        index += 1;

        if (index < candidates.length) {
          this.src = candidates[index];
          return;
        }

        this.remove();

        if (hasText && !content.querySelector(".twm_mark_text")) {
          addMarkTextSpan(content, text);
        }
      };

      iconImg.src = candidates[0];
      content.appendChild(iconImg);
    }

    if (hasText) {
      addMarkTextSpan(content, text);
    }

    container.appendChild(content);
  }

  function markImg(img, coord, group) {
    if (!img || !img.parentElement) {
      return;
    }

    const parent = img.parentElement;

    if (getComputedStyle(parent).position === "static") {
      parent.style.position = "relative";
    }

    const box = document.createElement("div");

    box.className = "twm_mark";
    box.dataset.coord = coord;
    box.dataset.group = group.id;
    box.title = group.name + " - " + coord;

    const left = img.style.left || img.offsetLeft + "px";
    const top = img.style.top || img.offsetTop + "px";
    const width = img.style.width || img.width + "px";
    const height = img.style.height || img.height + "px";

    let z = parseInt(img.style.zIndex || getComputedStyle(img).zIndex || 5, 10);
    if (isNaN(z)) {
      z = 5;
    }

    const bgOpacity = 0.42;
    const borderSize = 3;

    box.style.cssText =
      "position:absolute;" +
      "left:" + left + ";" +
      "top:" + top + ";" +
      "width:" + width + ";" +
      "height:" + height + ";" +
      "box-sizing:border-box;" +
      "border:" + borderSize + "px solid " + group.color + ";" +
      "background:" + alpha(group.color, bgOpacity) + ";" +
      "box-shadow:0 0 7px 3px " + group.color + ";" +
      "border-radius:3px;" +
      "z-index:" + (z + 50) + ";" +
      "pointer-events:none;" +
      "display:flex;" +
      "align-items:center;" +
      "justify-content:center;" +
      "overflow:hidden;";

    const defense = defenseResults[coord];
    const attack = attackResults[coord];

    if (group.systemType === "attackers" && attackerSourceResults[coord]) {
      populateAttackerSourceContent(box, coord);
      box.title = formatAttackerSourceTitle(coord);
    } else if (attack && attack.total > 0) {
      populateAttackContent(box, attack, defense);
      box.title = group.name + " - " + formatAttackTitle(coord, attack, defense);
    } else if (defense) {
      populateDefenseContent(box, defense);
      box.title = group.name + " - " + coord + " | " + formatDefenseTitle(defense);
    } else {
      populateMarkContent(box, group);
    }

    parent.appendChild(box);
  }

  function refreshAttackRisks() {
    Object.keys(attackResults).forEach(function (coord) {
      const existing = attackResults[coord];

      if (!existing || !existing.total) {
        return;
      }

      const rawCounts = emptyAttackCounts();

      [
        "total", "scout", "noble", "ram", "catapult", "small", "medium", "large",
        "unknown", "willBeDetectedByTower", "notDetectedByTower", "towerPending", "detectedRealAttack"
      ].forEach(function (key) {
        rawCounts[key] = existing[key] || 0;
      });

      attackResults[coord] = buildAttackResult(coord, rawCounts);
    });
  }

  function draw() {
    clearMarks();
    clearDefenseOverlays();
    clearAttackOverlays();
    refreshAttackRisks();

    Object.values(groups).forEach(function (group) {
      Object.keys(group.coords || {}).forEach(function (coord) {
        const village = w.TWMap.villages[keyOf(coord)];

        if (!village || !village.id) {
          return;
        }

        const img = document.getElementById("map_village_" + village.id);

        if (img) {
          markImg(img, coord, group);
        }
      });
    });

    drawStandaloneDefenseOverlays();
    drawStandaloneAttackOverlays();

    movePanelsToHost();
    refreshAllPanels();
  }

  function totalAll() {
    let total = 0;

    Object.values(groups).forEach(function (group) {
      total += Object.keys(group.coords || {}).length;
    });

    return total;
  }

  function setActiveGroup(id) {
    if (!groups[id]) {
      return;
    }

    activeGroupId = id;
    refreshAllPanels();
    draw();
  }

  function setGroupStatus(message, isError) {
    const el = document.getElementById("twm_group_status");

    if (!el) {
      return;
    }

    el.textContent = message || "";
    el.style.color = isError ? "#7a0000" : "#333";
  }

  function setDefenseStatus(message, isError) {
    const el = document.getElementById("twm_defense_status");

    if (!el) {
      return;
    }

    el.textContent = message || "";
    el.style.color = isError ? "#7a0000" : "#333";
  }

  function updateGroupInfo() {
    const el = document.getElementById("twm_group_status");

    if (!el) {
      return;
    }

    const active = activeGroupId ? groups[activeGroupId] : null;

    el.textContent =
      "Editando: " +
      (active ? active.name : "nenhum grupo") +
      " | Total geral: " +
      totalAll();
    el.style.color = "#333";
  }

  function updateClickButton() {
    const btn = document.getElementById("twm_click_mode");

    if (!btn) {
      return;
    }

    btn.textContent = "Modo clique: " + (clickMode ? "ON" : "OFF");
    btn.style.fontWeight = clickMode ? "bold" : "normal";
  }

  function drag(panel, header) {
    let offsetX = 0;
    let offsetY = 0;
    let dragging = false;

    header.style.cursor = "move";

    header.onmousedown = function (event) {
      if (
        event.target.tagName === "BUTTON" ||
        event.target.tagName === "INPUT" ||
        event.target.closest("label")
      ) {
        return;
      }

      dragging = true;
      offsetX = event.clientX - panel.offsetLeft;
      offsetY = event.clientY - panel.offsetTop;
      event.preventDefault();
    };

    document.addEventListener("mousemove", function (event) {
      if (!dragging) {
        return;
      }

      panel.style.left = event.clientX - offsetX + "px";
      panel.style.top = event.clientY - offsetY + "px";
      panel.style.right = "auto";
    });

    document.addEventListener("mouseup", function () {
      dragging = false;
    });
  }

  function buildIconGridHtml() {
    const btnStyle =
      "width:26px;height:26px;padding:2px;margin:1px;" +
      "border:1px solid #7d510f;background:#fff;cursor:pointer;" +
      "display:inline-flex;align-items:center;justify-content:center;" +
      "vertical-align:middle;box-sizing:border-box;";

    return ICON_PRESETS.map(function (preset) {
      if (!preset.value) {
        return (
          '<button type="button" class="twm_icon_btn" data-icon="" title="' +
          preset.label +
          '" style="' + btnStyle + 'font-size:9px;line-height:1;">Sem</button>'
        );
      }

      return (
        '<button type="button" class="twm_icon_btn" data-icon="' +
        preset.value +
        '" title="' +
        preset.label +
        '" style="' + btnStyle + '">' +
        '<img src="' + preset.src + '" alt="" style="width:16px;height:16px;pointer-events:none;">' +
        "</button>"
      );
    }).join("");
  }

  function setGroupPanelEnabled(panel, enabled) {
    const body = panel.querySelector(".twm_body");

    if (!body) {
      return;
    }

    const coordsArea = panel.querySelector(".twm_coords");
    const coordsDraft = coordsArea ? coordsArea.value : "";

    body.querySelectorAll("input, textarea, button").forEach(function (el) {
      el.disabled = !enabled;
    });

    if (coordsArea) {
      coordsArea.value = coordsDraft;
    }

    body.style.opacity = enabled ? "1" : "0.55";
    body.style.filter = enabled ? "brightness(1)" : "brightness(0.75)";
  }

  function refreshIconGrid(panel, group) {
    const grid = panel.querySelector(".twm_icon_grid");

    if (!grid) {
      return;
    }

    grid.querySelectorAll(".twm_icon_btn").forEach(function (btn) {
      const iconVal = btn.dataset.icon || "";
      const selected = (group.icon || "") === iconVal;

      btn.style.border = selected ? "2px solid #004cff" : "1px solid #7d510f";
      btn.style.background = selected ? "#fff8dc" : "#fff";
      btn.style.boxShadow = selected ? "0 0 3px #004cff" : "none";
    });
  }

  function createMainPanel() {
    const panel = document.createElement("div");

    panel.id = "twm_main_panel";
    panel.className = "twm_main_panel";

    panel.style.cssText =
      "position:fixed;" +
      "right:18px;" +
      "top:90px;" +
      "z-index:2147483647;" +
      "background:#f4e4bc;" +
      "border:2px solid #7d510f;" +
      "box-shadow:0 0 8px #000;" +
      "color:#000;" +
      "font-size:12px;" +
      "min-width:260px;";

    panel.innerHTML =
      '<div id="twm_main_head" style="background:#d7bd82;padding:6px;font-weight:bold;">' +
        "Marcador V7 " +
        '<button id="twm_close_all" style="float:right">X</button>' +
      "</div>" +
      '<div style="padding:7px">' +
        '<div class="twm_section" style="margin-bottom:8px;">' +
          '<div class="twm_section_title" style="font-weight:bold;margin-bottom:4px;border-bottom:1px solid #7d510f;padding-bottom:2px;">Grupos</div>' +
          '<button id="twm_new_group">Novo grupo</button> ' +
          '<button id="twm_click_mode">Modo clique: OFF</button> ' +
          '<button id="twm_clear_groups">Limpar grupos</button>' +
          '<div id="twm_group_status" style="margin-top:4px;font-size:11px;color:#333;"></div>' +
        "</div>" +
        '<div class="twm_section" style="margin-bottom:8px;">' +
          '<div class="twm_section_title" style="font-weight:bold;margin-bottom:4px;border-bottom:1px solid #7d510f;padding-bottom:2px;">Defesa</div>' +
          '<label style="display:block;margin-bottom:4px;font-size:11px;">Calcular defesa: ' +
            '<select id="twm_defense_group_select" style="max-width:180px;margin-left:2px;"></select>' +
          "</label>" +
          '<button id="twm_map_group_defense">Mapear defesa do grupo</button> ' +
          '<button id="twm_cancel_defense" disabled>Cancelar mapeamento</button> ' +
          '<button id="twm_clear_defense">Limpar defesa</button>' +
          '<div id="twm_defense_legend" style="margin-top:5px;font-size:11px;line-height:14px;color:#333;">' +
            "<div><b>P</b> = Full defesa próprio na aldeia</div>" +
            "<div><b>F</b> = Full defesa de fora / apoio</div>" +
            "<div><b>T</b> = Total de full def na aldeia</div>" +
          "</div>" +
          '<div id="twm_defense_info" style="font-size:11px;margin-top:4px;color:#333;"></div>' +
          '<div id="twm_defense_status" style="font-size:11px;margin-top:2px;color:#333;"></div>' +
        "</div>" +
        '<div class="twm_section" style="margin-bottom:8px;">' +
          '<div class="twm_section_title" style="font-weight:bold;margin-bottom:4px;border-bottom:1px solid #7d510f;padding-bottom:2px;">Ataques</div>' +
          '<label style="display:block;margin-bottom:4px;font-size:11px;">Mapear: ' +
            '<select id="twm_attack_target_select" style="max-width:180px;margin-left:2px;"></select>' +
          "</label>" +
          '<button id="twm_map_attacks">Mapear ataques</button> ' +
          '<button id="twm_cancel_attack" disabled>Cancelar mapeamento</button> ' +
          '<button id="twm_clear_attack">Limpar ataques</button>' +
          '<div id="twm_attack_legend" style="margin-top:5px;font-size:11px;line-height:14px;color:#333;">' +
            "<div><b>A</b> = ataques chegando</div>" +
            "<div><b>D</b> = total de full defesa</div>" +
            "<div><b>R</b> = risco</div>" +
            "<div><b>S</b> = exploradores/scouts</div>" +
            "<div><b>SCOUT</b> = apenas exploradores</div>" +
            "<div><b>TORRE</b> = aguardando detecção da torre</div>" +
            "<div><b>INCERTO</b> = tipo ainda não confiável</div>" +
            "<div><b>ALTO/CRÍTICO</b> = exige atenção</div>" +
          "</div>" +
          '<div id="twm_attack_info" style="font-size:11px;margin-top:4px;color:#333;"></div>' +
          '<div id="twm_attack_status" style="font-size:11px;margin-top:2px;color:#333;"></div>' +
        "</div>" +
      "</div>";

    host().appendChild(panel);
    drag(panel, document.getElementById("twm_main_head"));

    document.getElementById("twm_new_group").onclick = function () {
      const id = "g" + Date.now();

      groups[id] = {
        id: id,
        name: "Novo grupo",
        color: "#ff0000",
        text: "",
        icon: "",
        note: "",
        coordInputDraft: "",
        coords: {}
      };

      createGroupPanel(groups[id]);
      setActiveGroup(id);
      setGroupStatus("Grupo criado: Novo grupo");
    };

    document.getElementById("twm_click_mode").onclick = function () {
      const active = activeGroupId ? groups[activeGroupId] : null;

      if (!active) {
        clickMode = false;
        updateClickButton();
        setGroupStatus("Crie um grupo antes de ativar o modo clique.", true);
        return;
      }

      clickMode = !clickMode;
      updateClickButton();

      if (clickMode) {
        setGroupStatus("Modo clique ativado para: " + active.name);
      } else {
        setGroupStatus("Modo clique desativado.");
      }
    };

    document.getElementById("twm_clear_groups").onclick = function () {
      if (!confirm("Apagar todas as marcações de grupos?")) {
        return;
      }

      Object.values(groups).forEach(function (group) {
        group.coords = {};
      });

      draw();
      setGroupStatus("Marcações de grupos removidas.");
    };

    document.getElementById("twm_cancel_defense").onclick = function () {
      cancelDefenseMapping();
    };

    document.getElementById("twm_map_group_defense").onclick = function () {
      mapDefenseForSelectedGroup();
    };

    document.getElementById("twm_clear_defense").onclick = function () {
      clearAllDefense();
    };

    document.getElementById("twm_cancel_attack").onclick = function () {
      cancelAttackMapping();
    };

    document.getElementById("twm_map_attacks").onclick = function () {
      mapAttacksForSelectedTarget();
    };

    document.getElementById("twm_clear_attack").onclick = function () {
      clearAllAttacks();
    };

    refreshDefenseGroupSelect();
    refreshAttackTargetSelect();

    document.getElementById("twm_close_all").onclick = function () {
      if (w.__twm_defense_cancel) {
        w.__twm_defense_cancel();
        w.__twm_defense_cancel = null;
      }

      if (w.__twm_attack_cancel) {
        w.__twm_attack_cancel();
        w.__twm_attack_cancel = null;
      }

      defenseMappingInProgress = false;
      defenseMappingCancelled = false;
      attackMappingInProgress = false;
      attackMappingCancelled = false;
      defenseResults = {};
      attackResults = {};
      attackerSourceResults = {};

      if (w.__twm_defense_mapping_timer) {
        clearTimeout(w.__twm_defense_mapping_timer);
        w.__twm_defense_mapping_timer = null;
      }

      if (w.__twm_attack_mapping_timer) {
        clearTimeout(w.__twm_attack_mapping_timer);
        w.__twm_attack_mapping_timer = null;
      }

      document.querySelectorAll(".twm_mark, .twm_defense_mark, .twm_attack_mark, .twm_panel, .twm_main_panel").forEach(function (el) {
        el.remove();
      });

      if (w.__twm_interval) {
        clearInterval(w.__twm_interval);
        w.__twm_interval = null;
      }

      if (w.__twm_fullscreen_listener) {
        document.removeEventListener("fullscreenchange", w.__twm_fullscreen_listener);
        w.__twm_fullscreen_listener = null;
      }

      if (w.__twm_click_listener) {
        document.removeEventListener("click", w.__twm_click_listener, true);
        w.__twm_click_listener = null;
      }
    };
  }

  function createGroupPanel(group) {
    const panel = document.createElement("div");
    const panelIndex = document.querySelectorAll(".twm_panel").length;
    const pos = getNextPanelPosition(panelIndex);

    panel.id = "twm_panel_" + group.id;
    panel.className = "twm_panel";
    panel.dataset.group = group.id;

    panel.style.cssText =
      "position:fixed;" +
      "left:" + pos.left + "px;" +
      "top:" + pos.top + "px;" +
      "z-index:2147483647;" +
      "background:#f4e4bc;" +
      "border:2px solid #7d510f;" +
      "box-shadow:0 0 8px #000;" +
      "color:#000;" +
      "font-size:12px;" +
      "width:335px;";

    panel.innerHTML =
      '<div class="twm_head" style="background:#d7bd82;padding:6px;font-weight:bold;display:flex;align-items:center;gap:6px;min-width:0;">' +
        '<span class="twm_title" style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></span>' +
        '<label class="twm_active_label" title="Selecionar este grupo" style="flex-shrink:0;display:flex;align-items:center;gap:3px;font-size:11px;font-weight:normal;cursor:pointer;opacity:1;filter:none;">' +
          '<input type="checkbox" class="twm_active_checkbox">' +
          "Selecionado" +
        "</label>" +
        '<button class="twm_del_group" style="flex-shrink:0;margin:0">Excluir</button>' +
      "</div>" +
      '<div class="twm_body" style="padding:7px">' +
        '<div class="twm_row" style="display:flex;align-items:center;gap:4px;margin-top:0;">' +
          '<span style="flex-shrink:0">Nome:</span>' +
          '<input class="twm_name twm_name_input" style="flex:1;min-width:0">' +
          '<span style="flex-shrink:0">Cor:</span>' +
          '<input class="twm_color twm_color_input" type="color" style="width:42px;height:24px;padding:0;border:1px solid #7d510f;flex-shrink:0">' +
        "</div>" +
        '<div class="twm_row" style="display:flex;align-items:center;gap:4px;margin-top:4px;">' +
          '<span style="flex-shrink:0">Texto mapa:</span>' +
          '<input class="twm_text_symbol" maxlength="6" style="width:52px;flex-shrink:0">' +
          '<span style="font-size:10px;color:#555">máx. 6</span>' +
        "</div>" +
        '<div style="margin-top:6px;font-weight:bold">Ícone:</div>' +
        '<div class="twm_icon_grid" style="display:flex;flex-wrap:wrap;gap:2px;margin:4px 0;">' +
          buildIconGridHtml() +
        "</div>" +
        'Observação:<br>' +
        '<textarea class="twm_note" style="width:100%;height:44px;margin-top:2px;box-sizing:border-box" placeholder="Anotações do grupo (não aparece no mapa)"></textarea>' +
        "<br>" +
        'Coordenadas:<br>' +
        '<textarea class="twm_coords" style="width:100%;height:38px;margin-top:2px;box-sizing:border-box;overflow-y:auto;resize:vertical" placeholder="565|526"></textarea>' +
        "<br>" +
        '<button class="twm_add_coords">Adicionar coords</button> ' +
        '<button class="twm_copy_coords">Copiar</button> ' +
        '<button class="twm_clear_group">Limpar grupo</button>' +
        '<div class="twm_info" style="margin-top:5px;font-size:11px"></div>' +
      "</div>";

    host().appendChild(panel);
    drag(panel, panel.querySelector(".twm_head"));

    const nameInput = panel.querySelector(".twm_name");
    const colorInput = panel.querySelector(".twm_color");
    const textInput = panel.querySelector(".twm_text_symbol");
    const noteArea = panel.querySelector(".twm_note");
    const coordsArea = panel.querySelector(".twm_coords");
    const iconGrid = panel.querySelector(".twm_icon_grid");
    const activeCheckbox = panel.querySelector(".twm_active_checkbox");

    nameInput.value = group.name;
    colorInput.value = group.color;
    textInput.value = group.text || "";
    noteArea.value = group.note || "";
    coordsArea.value = group.coordInputDraft || "";

    function saveGroupFields() {
      group.name = nameInput.value.trim() || group.name;
      group.color = colorInput.value || group.color;
      group.text = textInput.value.trim().slice(0, 6);
      group.note = noteArea.value;
    }

    textInput.addEventListener("input", function () {
      if (this.value.length > 6) {
        this.value = this.value.slice(0, 6);
      }

      saveGroupFields();
      draw();
    });

    [nameInput, colorInput, textInput, noteArea].forEach(function (input) {
      input.addEventListener("change", function () {
        saveGroupFields();
        refreshIconGrid(panel, group);
        draw();
      });
    });

    coordsArea.addEventListener("input", function () {
      this.value = formatCoordInput(this.value);
      group.coordInputDraft = this.value;
      this.selectionStart = this.selectionEnd = this.value.length;
    });

    coordsArea.addEventListener("focus", function () {
      const field = this;

      setTimeout(function () {
        field.selectionStart = field.selectionEnd = field.value.length;
      }, 0);
    });

    coordsArea.addEventListener("click", function () {
      this.selectionStart = this.selectionEnd = this.value.length;
    });

    coordsArea.addEventListener("blur", function () {
      group.coordInputDraft = this.value;
    });

    activeCheckbox.addEventListener("click", function (event) {
      event.stopPropagation();
    });

    activeCheckbox.addEventListener("change", function () {
      if (activeGroupId === group.id && !this.checked) {
        this.checked = true;
        return;
      }

      if (this.checked) {
        saveGroupFields();
        setActiveGroup(group.id);
      }
    });

    iconGrid.querySelectorAll(".twm_icon_btn").forEach(function (btn) {
      btn.onclick = function () {
        group.icon = btn.dataset.icon || "";
        saveGroupFields();
        refreshIconGrid(panel, group);
        draw();
      };
    });

    panel.querySelector(".twm_add_coords").onclick = function () {
      saveGroupFields();

      const parsed = parseCoords(coordsArea.value);

      if (!parsed.length) {
        setGroupStatus("Nenhuma coordenada válida para adicionar.", true);
        return;
      }

      parsed.forEach(function (coord) {
        removeCoordFromAll(coord);
        group.coords[coord] = 1;
      });

      group.coordInputDraft = "";
      coordsArea.value = "";
      setGroupStatus(parsed.length + " coordenada(s) adicionada(s) em " + group.name + ".");
      draw();
    };

    panel.querySelector(".twm_copy_coords").onclick = function () {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(coordsToText(group));
      }
    };

    panel.querySelector(".twm_clear_group").onclick = function () {
      if (!confirm('Limpar grupo "' + group.name + '"?')) {
        return;
      }

      group.coords = {};
      group.coordInputDraft = "";
      coordsArea.value = "";
      draw();
    };

    panel.querySelector(".twm_del_group").onclick = function () {
      if (!confirm('Excluir grupo "' + group.name + '"?')) {
        return;
      }

      delete groups[group.id];
      panel.remove();

      if (activeGroupId === group.id) {
        const remaining = Object.keys(groups);
        activeGroupId = remaining.length ? remaining[0] : null;

        if (!activeGroupId) {
          clickMode = false;
          updateClickButton();
          setGroupStatus("Nenhum grupo selecionado.", true);
        }
      }

      draw();
      refreshAllPanels();
    };

    refreshGroupPanel(group, { forceFields: true });
  }

  function refreshGroupPanel(group, options) {
    options = options || {};

    const panel = document.getElementById("twm_panel_" + group.id);

    if (!panel) {
      return;
    }

    const isActive = group.id === activeGroupId;
    const count = Object.keys(group.coords || {}).length;
    const title = panel.querySelector(".twm_title");
    const head = panel.querySelector(".twm_head");
    const noteArea = panel.querySelector(".twm_note");
    const coordsArea = panel.querySelector(".twm_coords");
    const activeCheckbox = panel.querySelector(".twm_active_checkbox");

    title.textContent = group.name + " (" + count + ")";

    if (activeCheckbox) {
      activeCheckbox.checked = isActive;
    }

    panel.querySelector(".twm_info").textContent =
      "Coords: " + count + (isActive ? " | selecionado" : " | bloqueado");

    if (options.forceFields || (noteArea && document.activeElement !== noteArea)) {
      noteArea.value = group.note || "";
    }

    if (coordsArea && document.activeElement !== coordsArea) {
      coordsArea.value = group.coordInputDraft || "";
    }

    refreshIconGrid(panel, group);
    setGroupPanelEnabled(panel, isActive);

    panel.style.opacity = "1";
    panel.style.filter = "none";

    if (head) {
      head.style.opacity = "1";
      head.style.filter = "none";
    }

    panel.style.borderColor = isActive ? group.color : "#7d510f";
  }

  function updateDefenseInfo() {
    const info = document.getElementById("twm_defense_info");

    if (!info) {
      return;
    }

    info.textContent = "Defesa: " + countDefenseResults() + " aldeia(s) mapeada(s)";
  }

  function refreshAllPanels() {
    Object.values(groups).forEach(function (group) {
      refreshGroupPanel(group);
    });

    updateGroupInfo();
    updateDefenseInfo();
    updateAttackInfo();
    updateDefenseButtons();
    updateAttackButtons();
    refreshDefenseGroupSelect();
    refreshAttackTargetSelect();
  }

  w.__twm_click_listener = function (event) {
    if (!clickMode) {
      return;
    }

    if (event.target.closest(".twm_panel, .twm_main_panel")) {
      return;
    }

    let coord = null;
    const villageImg = event.target.closest('img[id^="map_village_"]');

    if (villageImg) {
      coord = findCoordByVillageId(villageImg.id.replace("map_village_", ""));
    }

    if (!coord) {
      coord = coordFromEvent(event);
    }

    if (!coord || !w.TWMap.villages[keyOf(coord)]) {
      return;
    }

    const active = activeGroupId ? groups[activeGroupId] : null;

    if (!active) {
      clickMode = false;
      updateClickButton();
      setGroupStatus("Crie ou selecione um grupo antes de marcar aldeias.", true);
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (active.coords[coord]) {
      delete active.coords[coord];
    } else {
      removeCoordFromAll(coord);
      active.coords[coord] = 1;
    }

    draw();
  };

  document.addEventListener("click", w.__twm_click_listener, true);

  w.__twm_fullscreen_listener = function () {
    setTimeout(function () {
      movePanelsToHost();
      draw();
    }, 150);
  };

  document.addEventListener("fullscreenchange", w.__twm_fullscreen_listener);

  createMainPanel();

  w.__twm_interval = setInterval(draw, 800);

  draw();
})();
