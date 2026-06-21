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
      notDetectedByTower: 0
    };
  }

  function mergeAttackRow(target, row) {
    target.total += row.total || 0;

    ["scout", "noble", "ram", "catapult", "small", "medium", "large", "unknown", "willBeDetectedByTower", "notDetectedByTower"].forEach(function (key) {
      target[key] += row[key] || 0;
    });
  }

  function isIncomingCommandRow(row) {
    const hay = (row.innerHTML || "").toLowerCase();

    return (
      /graphic\/(command|unit|unit_map)/.test(hay) ||
      /attack|ataque|angriff|spy|snob|ram|catapult|explorador|nobre|ariete|catapulta/.test(hay)
    );
  }

  function classifyAttackRow(row) {
    const counts = emptyAttackCounts();

    counts.total = 1;

    const imgs = Array.from(row.querySelectorAll("img")).map(function (img) {
      return (
        (img.getAttribute("src") || "") + " " +
        (img.getAttribute("title") || "") + " " +
        (img.getAttribute("alt") || "")
      );
    }).join(" ").toLowerCase();

    const text = (row.textContent || "").toLowerCase();
    const hay = imgs + " " + text;

    if (/spy|explorador|scout|spion|verkenner|unit_map\/spy/.test(hay)) {
      counts.scout += 1;
    } else if (/snob|nobre|adel|fürst|prince|unit_map\/snob/.test(hay)) {
      counts.noble += 1;
    } else if (/\bram\b|ariete|sturmramme|ramme|unit_map\/ram/.test(hay)) {
      counts.ram += 1;
    } else if (/catapult|catapulta|katapult|unit_map\/catapult/.test(hay)) {
      counts.catapult += 1;
    } else if (/attack_small|ataque pequeno|kleiner angriff|small attack|pequeno/.test(hay)) {
      counts.small += 1;
    } else if (/attack_medium|ataque m[ée]dio|medium attack|mittlerer|medio/.test(hay)) {
      counts.medium += 1;
    } else if (/attack_large|ataque grande|large attack|gro[ßs]er angriff|grande/.test(hay)) {
      counts.large += 1;
    } else if (/attack|ataque|angriff|graphic\/command\/attack|graphic\/unit\/att/.test(hay)) {
      counts.unknown += 1;
    } else {
      counts.unknown += 1;
    }

    if (/n[aã]o ser[aá] detectad|nao sera detectad|nicht.*erkannt|not be detected|won't be detected|nao.*detectad/.test(text)) {
      counts.notDetectedByTower += 1;
    } else if (/ser[aá] detectad|sera detectad|will be detected|wird.*erkannt|detected by the watch/.test(text)) {
      counts.willBeDetectedByTower += 1;
    }

    return counts;
  }

  function findIncomingAttacksTable(doc) {
    const incomingLabels = /chegando|incoming|ankommend|arriv/i;
    let targetTable = null;

    doc.querySelectorAll("h2, h3, h4, caption, th, td, span").forEach(function (el) {
      if (targetTable || !incomingLabels.test(el.textContent || "")) {
        return;
      }

      let table = el.closest("table");

      if (!table) {
        let node = el;

        for (let i = 0; i < 4 && node && !table; i++) {
          if (node.nextElementSibling && node.nextElementSibling.tagName === "TABLE") {
            table = node.nextElementSibling;
            break;
          }

          node = node.parentElement;
        }
      }

      if (table) {
        targetTable = table;
      }
    });

    if (!targetTable) {
      targetTable =
        doc.querySelector("#commands_incoming_table") ||
        doc.querySelector("table.incoming") ||
        doc.querySelector("table#show_units");
    }

    if (!targetTable) {
      doc.querySelectorAll("table").forEach(function (table) {
        if (targetTable) {
          return;
        }

        let hasCommand = false;

        table.querySelectorAll("tr").forEach(function (row) {
          if (hasCommand) {
            return;
          }

          if (isIncomingCommandRow(row)) {
            hasCommand = true;
          }
        });

        if (hasCommand) {
          targetTable = table;
        }
      });
    }

    return targetTable;
  }

  function parseIncomingAttacksFromHtml(html) {
    if (!html || typeof html !== "string") {
      return null;
    }

    const doc = document.createElement("div");

    doc.innerHTML = html;

    const pageText = (doc.textContent || "").toLowerCase();
    const table = findIncomingAttacksTable(doc);
    const result = emptyAttackCounts();

    if (!table) {
      if (/chegando|incoming|ankommend/.test(pageText)) {
        return result;
      }

      return null;
    }

    table.querySelectorAll("tr").forEach(function (row) {
      if (row.querySelector("th")) {
        return;
      }

      if (!isIncomingCommandRow(row)) {
        return;
      }

      mergeAttackRow(result, classifyAttackRow(row));
    });

    return result;
  }

  function getVillageIncomingAttacks(village) {
    return fetchGameUrl(buildInfoVillageUrl(village.id)).then(function (response) {
      return parseIncomingAttacksFromHtml(response);
    });
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

    if (attackData.noble > 0) {
      return "critico";
    }

    if (attackData.notDetectedByTower > 0) {
      return "alto";
    }

    if (attackData.unknown > 0) {
      return "medio";
    }

    if (defenseData) {
      const totalDefense = defenseData.totalFull;
      const attackWeight =
        attackData.large +
        attackData.medium * 0.5 +
        attackData.small * 0.25 +
        attackData.unknown;

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

    if (attackData.total >= 5) {
      return "alto";
    }

    if (attackData.total >= 2) {
      return "medio";
    }

    return "baixo";
  }

  function buildAttackResult(coord, rawCounts) {
    const defenseData = getDefenseDataForRisk(coord);
    const result = Object.assign({}, rawCounts);

    result.noDefenseData = !defenseData;
    result.risk = calculateAttackRisk(coord, result, defenseData);

    return result;
  }

  function formatRiskLabel(risk) {
    const labels = {
      baixo: "BAIXO",
      medio: "MEDIO",
      alto: "ALTO",
      critico: "CRITICO"
    };

    return labels[risk] || "???";
  }

  function getAttackRiskColor(attack) {
    if (!attack) {
      return "#888888";
    }

    if (attack.notDetectedByTower > 0 && attack.risk !== "critico") {
      return "#660000";
    }

    if (attack.willBeDetectedByTower > 0 && attack.unknown > 0 && attack.risk === "medio") {
      return "#888888";
    }

    const colors = {
      baixo: "#e6c200",
      medio: "#ff8800",
      alto: "#cc0000",
      critico: "#9900cc"
    };

    return colors[attack.risk] || "#888888";
  }

  function formatAttackText(attack, defense) {
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
      "Detectado torre: " + attack.willBeDetectedByTower,
      "Fora torre: " + attack.notDetectedByTower
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
    const mapBtn = document.getElementById("twm_map_group_attack");

    if (cancelBtn) {
      cancelBtn.disabled = !attackMappingInProgress;
    }

    if (mapBtn) {
      mapBtn.disabled = attackMappingInProgress;
    }
  }

  function refreshAttackGroupSelect() {
    const select = document.getElementById("twm_attack_group_select");

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

  async function mapAttackForSelectedGroup() {
    if (attackMappingInProgress) {
      setAttackStatus("Mapeamento de ataques já em andamento.", true);
      return;
    }

    const select = document.getElementById("twm_attack_group_select");
    const groupId = select ? select.value : "";
    const group = groupId ? groups[groupId] : null;

    if (!group) {
      setAttackStatus("Selecione um grupo para mapear ataques.", true);
      return;
    }

    await mapAttackForGroup(group);
  }

  async function mapAttackForGroup(group) {
    if (!group || !group.coords) {
      setAttackStatus("Grupo inválido para mapear ataques.", true);
      return;
    }

    const coords = Object.keys(group.coords);

    if (!coords.length) {
      setAttackStatus("O grupo " + group.name + " não tem aldeias.", true);
      return;
    }

    attackMappingCancelled = false;
    attackMappingInProgress = true;
    updateAttackButtons();
    w.__twm_attack_cancel = cancelAttackMapping;

    let mapped = 0;
    let skipped = 0;
    let failed = 0;

    setAttackStatus("Mapeando ataques do grupo " + group.name + "...");

    for (let i = 0; i < coords.length; i++) {
      if (attackMappingCancelled) {
        break;
      }

      const coord = coords[i];
      const village = w.TWMap.villages[keyOf(coord)];

      if (!village || !village.id) {
        skipped++;
        setAttackStatus(
          "Mapeando " + group.name + " " + (i + 1) + "/" + coords.length +
          " | fora da área visível: " + coord
        );
        continue;
      }

      try {
        const raw = await getVillageIncomingAttacks(village);

        if (attackMappingCancelled) {
          break;
        }

        if (!raw) {
          failed++;
          setAttackStatus(
            "Sem dados de ataques em " + coord + " (" + (i + 1) + "/" + coords.length + ")"
          );
          continue;
        }

        if (raw.total > 0) {
          attackResults[coord] = buildAttackResult(coord, raw);
          mapped++;
        } else if (attackResults[coord]) {
          delete attackResults[coord];
        }

        draw();

        setAttackStatus(
          "Mapeando " + group.name + " " + (i + 1) + "/" + coords.length +
          " | OK: " + coord + " (" + raw.total + " ataque(s))"
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
    draw();

    if (attackMappingCancelled) {
      setAttackStatus(
        "Mapeamento cancelado. Grupo: " + group.name +
        " | OK: " + mapped +
        " | Falhas: " + failed +
        " | Fora da tela: " + skipped
      );
    } else {
      setAttackStatus(
        "Mapeamento concluído. Grupo: " + group.name +
        " | OK: " + mapped +
        " | Falhas: " + failed +
        " | Fora da tela: " + skipped
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

    if (attack && attack.total > 0) {
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
        "unknown", "willBeDetectedByTower", "notDetectedByTower"
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
          '<label style="display:block;margin-bottom:4px;font-size:11px;">Grupo alvo: ' +
            '<select id="twm_attack_group_select" style="max-width:180px;margin-left:2px;"></select>' +
          "</label>" +
          '<button id="twm_map_group_attack">Mapear ataques do grupo</button> ' +
          '<button id="twm_cancel_attack" disabled>Cancelar mapeamento</button> ' +
          '<button id="twm_clear_attack">Limpar ataques</button>' +
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

    document.getElementById("twm_map_group_attack").onclick = function () {
      mapAttackForSelectedGroup();
    };

    document.getElementById("twm_clear_attack").onclick = function () {
      clearAllAttacks();
    };

    refreshDefenseGroupSelect();
    refreshAttackGroupSelect();

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
    refreshAttackGroupSelect();
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
