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
  let groupIndex = 0;

  const groups = {};

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

    populateMarkContent(box, group);
    parent.appendChild(box);
  }

  function draw() {
    clearMarks();

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

  function setStatus(message, isError) {
    const el = document.getElementById("twm_status");

    if (!el) {
      return;
    }

    el.textContent = message || "";
    el.style.color = isError ? "#7a0000" : "#333";
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

    body.querySelectorAll("input, textarea, button").forEach(function (el) {
      el.disabled = !enabled;
    });

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
        '<button id="twm_new_group">Novo grupo</button> ' +
        '<button id="twm_click_mode">Modo clique: OFF</button> ' +
        '<button id="twm_clear_all">Limpar tudo</button>' +
        '<div id="twm_main_info" style="margin-top:6px;font-size:11px"></div>' +
        '<div id="twm_status" style="margin-top:4px;color:#7a0000;font-size:11px;"></div>' +
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
        coords: {}
      };

      createGroupPanel(groups[id]);
      setActiveGroup(id);
      setStatus("Grupo criado: Novo grupo");
    };

    document.getElementById("twm_click_mode").onclick = function () {
      const active = activeGroupId ? groups[activeGroupId] : null;

      if (!active) {
        clickMode = false;
        updateClickButton();
        setStatus("Crie um grupo antes de ativar o modo clique.", true);
        return;
      }

      clickMode = !clickMode;
      updateClickButton();

      if (clickMode) {
        setStatus("Modo clique ativado para: " + active.name);
      } else {
        setStatus("Modo clique desativado.");
      }
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
    coordsArea.value = coordsToText(group);

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
        setStatus("Nenhuma coordenada encontrada. Use 565|526.", true);
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

        if (!activeGroupId) {
          clickMode = false;
          updateClickButton();
          setStatus("Nenhum grupo selecionado.", true);
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
    const coordsArea = panel.querySelector(".twm_coords");
    const noteArea = panel.querySelector(".twm_note");
    const activeCheckbox = panel.querySelector(".twm_active_checkbox");

    title.textContent = group.name + " (" + count + ")";

    if (activeCheckbox) {
      activeCheckbox.checked = isActive;
    }

    panel.querySelector(".twm_info").textContent =
      "Coords: " + count + (isActive ? " | selecionado" : " | bloqueado");

    if (options.forceFields || (coordsArea && document.activeElement !== coordsArea)) {
      coordsArea.value = coordsToText(group);
    }

    if (options.forceFields || (noteArea && document.activeElement !== noteArea)) {
      noteArea.value = group.note || "";
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
      clickMode = false;
      updateClickButton();
      setStatus("Crie ou selecione um grupo antes de marcar aldeias.", true);
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
