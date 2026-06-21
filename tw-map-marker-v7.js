/* Tribal Wars - Marcador visual de aldeias V7
 *
 * Barra de acesso rápido:
 * javascript:$.getScript('https://cdn.jsdelivr.net/gh/JoaoMendonca99/tribalwars-scripts@main/tw-map-marker-v7.js?v=1');
 */
(function () {
  const w = window;

  if (!w.TWMap || !w.TWMap.villages) {
    alert("Abra isso dentro da tela do mapa.");
    return;
  }

  document.querySelectorAll(".twm_mark, .twm_panel, .twm_main_panel").forEach(function (el) {
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

  let clickMode = false;
  let activeGroupId = null;

  const groups = {};

  const ICON_PRESETS = [
    { value: "", label: "Sem ícone" },
    { value: "spear", label: "Lança" },
    { value: "sword", label: "Espada" },
    { value: "axe", label: "Machado" },
    { value: "archer", label: "Arqueiro" },
    { value: "spy", label: "Espião" },
    { value: "light", label: "Cavalaria leve" },
    { value: "marcher", label: "Arqueiro montado" },
    { value: "heavy", label: "Cavalaria pesada" },
    { value: "ram", label: "Aríete" },
    { value: "catapult", label: "Catapulta" },
    { value: "knight", label: "Paladino" },
    { value: "snob", label: "Nobre" },
    { value: "militia", label: "Milícia" },
    { value: "custom", label: "Personalizado" }
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

    (String(text || "").match(/\d{3}\s*\|\s*\d{3}|\d{3}\s*[,; ]\s*\d{3}/g) || []).forEach(function (part) {
      const match = part.match(/(\d{3})\D+(\d{3})/);
      if (match) {
        out.push(match[1] + "|" + match[2]);
      }
    });

    return [...new Set(out)];
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

  function showTextFallback(box, group) {
    box.textContent = group.text || "";
  }

  function loadIconIntoBox(box, group) {
    const candidates = iconCandidates(group.icon);

    if (!candidates.length) {
      showTextFallback(box, group);
      return;
    }

    const icon = document.createElement("img");
    let index = 0;

    icon.alt = group.text || group.name || "";
    icon.style.cssText =
      "max-width:20px;" +
      "max-height:20px;" +
      "width:auto;" +
      "height:auto;" +
      "pointer-events:none;";

    icon.onerror = function () {
      index += 1;

      if (index < candidates.length) {
        this.src = candidates[index];
        return;
      }

      this.remove();
      showTextFallback(box, group);
    };

    icon.src = candidates[0];
    box.appendChild(icon);
  }

  function markImg(img, coord, group, isActive) {
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

    const bgOpacity = isActive ? 0.42 : 0.2;
    const borderSize = isActive ? 3 : 2;
    const brightness = isActive ? "brightness(1)" : "brightness(0.55)";

    box.style.cssText =
      "position:absolute;" +
      "left:" + left + ";" +
      "top:" + top + ";" +
      "width:" + width + ";" +
      "height:" + height + ";" +
      "box-sizing:border-box;" +
      "border:" + borderSize + "px solid " + group.color + ";" +
      "background:" + alpha(group.color, bgOpacity) + ";" +
      "box-shadow:0 0 " + (isActive ? "7px 3px " : "4px 1px ") + group.color + ";" +
      "border-radius:3px;" +
      "z-index:" + (z + 50) + ";" +
      "pointer-events:none;" +
      "display:flex;" +
      "align-items:center;" +
      "justify-content:center;" +
      "color:#fff;" +
      "font-weight:bold;" +
      "font-size:14px;" +
      "text-shadow:1px 1px 2px #000,-1px -1px 2px #000;" +
      "line-height:1;" +
      "text-align:center;" +
      "overflow:hidden;" +
      "filter:" + brightness + ";";

    loadIconIntoBox(box, group);
    parent.appendChild(box);
  }

  function draw() {
    clearMarks();

    Object.values(groups).forEach(function (group) {
      const isActive = group.id === activeGroupId;

      Object.keys(group.coords || {}).forEach(function (coord) {
        const village = w.TWMap.villages[keyOf(coord)];

        if (!village || !village.id) {
          return;
        }

        const img = document.getElementById("map_village_" + village.id);

        if (img) {
          markImg(img, coord, group, isActive);
        }
      });
    });

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

  function drag(panel, header) {
    let offsetX = 0;
    let offsetY = 0;
    let dragging = false;

    header.style.cursor = "move";

    header.onmousedown = function (event) {
      if (event.target.tagName === "BUTTON") {
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

  function iconOptionsHtml() {
    return ICON_PRESETS.map(function (preset) {
      return (
        '<option value="' + preset.value + '">' + preset.label + "</option>"
      );
    }).join("");
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
        '<button id="twm_new_group">Novo grupo</button> ' +
        '<button id="twm_click_mode">Modo clique: OFF</button> ' +
        '<button id="twm_clear_all">Limpar tudo</button>' +
        '<div id="twm_main_info" style="margin-top:6px;font-size:11px"></div>' +
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
        coords: {}
      };

      createGroupPanel(groups[id]);
      setActiveGroup(id);
    };

    document.getElementById("twm_click_mode").onclick = function () {
      clickMode = !clickMode;
      this.textContent = "Modo clique: " + (clickMode ? "ON" : "OFF");
      this.style.fontWeight = clickMode ? "bold" : "normal";
    };

    document.getElementById("twm_clear_all").onclick = function () {
      if (!confirm("Apagar todas as marcações de todos os grupos?")) {
        return;
      }

      Object.values(groups).forEach(function (group) {
        group.coords = {};
      });

      draw();
    };

    document.getElementById("twm_close_all").onclick = function () {
      document.querySelectorAll(".twm_mark, .twm_panel, .twm_main_panel").forEach(function (el) {
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

  function syncIconPreset(iconPreset, iconUrl, group) {
    const presetValues = ICON_PRESETS.map(function (preset) {
      return preset.value;
    }).filter(function (value) {
      return value !== "custom";
    });

    if (presetValues.includes(group.icon || "")) {
      iconPreset.value = group.icon;
    } else if (group.icon) {
      iconPreset.value = "custom";
    } else {
      iconPreset.value = "";
    }

    iconUrl.value = group.icon || "";
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
      '<div class="twm_head" style="background:#d7bd82;padding:6px;font-weight:bold;">' +
        '<span class="twm_title"></span>' +
        '<button class="twm_del_group" style="float:right;margin-left:4px">Excluir</button>' +
        '<button class="twm_set_active" style="float:right">Selecionar</button>' +
      "</div>" +
      '<div class="twm_body" style="padding:7px">' +
        'Nome: <input class="twm_name" style="width:115px"> ' +
        'Cor: <input class="twm_color" type="color"> ' +
        'Texto: <input class="twm_text_symbol" maxlength="6" style="width:42px">' +
        "<br>" +
        'Ícone: <select class="twm_icon_preset" style="width:130px;margin-top:5px">' +
          iconOptionsHtml() +
        "</select> " +
        'URL: <input class="twm_icon_url" placeholder="axe ou /graphic/unit_map/snob.png" style="width:150px">' +
        '<textarea class="twm_coords" style="width:315px;height:80px;margin-top:6px" placeholder="Coords deste grupo. Ex: 565|526"></textarea>' +
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
    const iconPreset = panel.querySelector(".twm_icon_preset");
    const iconUrl = panel.querySelector(".twm_icon_url");
    const coordsArea = panel.querySelector(".twm_coords");

    nameInput.value = group.name;
    colorInput.value = group.color;
    textInput.value = group.text || "";
    coordsArea.value = coordsToText(group);
    syncIconPreset(iconPreset, iconUrl, group);

    function saveGroupFields() {
      group.name = nameInput.value.trim() || group.name;
      group.color = colorInput.value || group.color;
      group.text = textInput.value.trim() || "";
      group.icon = iconUrl.value.trim() || "";
    }

    [nameInput, colorInput, textInput, iconUrl].forEach(function (input) {
      input.addEventListener("change", function () {
        saveGroupFields();
        draw();
      });
    });

    iconPreset.onchange = function () {
      if (this.value === "custom") {
        return;
      }

      iconUrl.value = this.value;
      saveGroupFields();
      draw();
    };

    panel.querySelector(".twm_set_active").onclick = function () {
      saveGroupFields();
      setActiveGroup(group.id);
    };

    panel.querySelector(".twm_add_coords").onclick = function () {
      saveGroupFields();

      const parsed = parseCoords(coordsArea.value);

      if (!parsed.length) {
        alert("Nenhuma coordenada encontrada. Use 565|526.");
        return;
      }

      parsed.forEach(function (coord) {
        removeCoordFromAll(coord);
        group.coords[coord] = 1;
      });

      coordsArea.value = coordsToText(group);
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
      }

      draw();
    };

    refreshGroupPanel(group);
  }

  function refreshGroupPanel(group) {
    const panel = document.getElementById("twm_panel_" + group.id);

    if (!panel) {
      return;
    }

    const isActive = group.id === activeGroupId;
    const count = Object.keys(group.coords || {}).length;
    const title = panel.querySelector(".twm_title");
    const body = panel.querySelector(".twm_body");

    title.textContent =
      (isActive ? "EDITANDO: " : "Grupo: ") + group.name + " (" + count + ")";

    panel.querySelector(".twm_info").textContent =
      "Coords: " + count + (isActive ? " | ativo para clique" : " | inativo");

    panel.querySelector(".twm_coords").value = coordsToText(group);

    panel.style.opacity = "1";
    panel.style.filter = "none";

    if (isActive) {
      panel.style.borderColor = group.color;
      body.style.opacity = "1";
      body.style.filter = "brightness(1)";
    } else {
      panel.style.borderColor = "#7d510f";
      body.style.opacity = "0.55";
      body.style.filter = "brightness(0.75)";
    }
  }

  function refreshAllPanels() {
    Object.values(groups).forEach(function (group) {
      refreshGroupPanel(group);
    });

    const info = document.getElementById("twm_main_info");

    if (info) {
      const active = activeGroupId ? groups[activeGroupId] : null;

      info.textContent =
        "Editando: " +
        (active ? active.name : "nenhum grupo") +
        " | Total geral: " +
        totalAll();
    }
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
      alert("Crie ou selecione um grupo antes de marcar aldeias.");
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
