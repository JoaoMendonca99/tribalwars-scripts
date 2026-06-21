/* Tribal Wars - Marcador visual de aldeias V7
   V7:
   - começa zerado toda vez
   - janelas separadas por grupo
   - grupo ativo normal, grupos inativos escuros
   - ícones do próprio jogo
*/
(function () {
  const w = window;

  if (!w.TWMap || !w.TWMap.villages) {
    alert("Abra isso dentro da tela do mapa.");
    return;
  }

  document.querySelectorAll(".twm_mark,.twm_panel,.twm_main_panel").forEach(e => e.remove());

  if (w.__twm_interval) clearInterval(w.__twm_interval);
  if (w.__twm_fullscreen_listener) {
    document.removeEventListener("fullscreenchange", w.__twm_fullscreen_listener);
  }
  if (w.__twm_click_listener) {
    document.removeEventListener("click", w.__twm_click_listener, true);
  }

  let clickMode = false;
  let activeGroupId = "atk";
  let groupIndex = 0;

  const groups = {
    atk: {
      id: "atk",
      name: "Atacando",
      color: "#ff0000",
      text: "",
      icon: "/graphic/unit_map/axe.png",
      coords: {}
    },
    def: {
      id: "def",
      name: "Defendendo",
      color: "#004cff",
      text: "",
      icon: "/graphic/unit_map/sword.png",
      coords: {}
    },
    nobre: {
      id: "nobre",
      name: "Nobre",
      color: "#8a00ff",
      text: "",
      icon: "/graphic/unit_map/snob.png",
      coords: {}
    }
  };

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

    document.querySelectorAll(".twm_panel,.twm_main_panel").forEach(p => {
      if (p.parentElement !== h) h.appendChild(p);
      p.style.zIndex = "2147483647";
    });
  }

  function keyOf(coord) {
    return String(coord).replace("|", "");
  }

  function coordText(k) {
    k = String(k);
    return k.includes("|") ? k : k.slice(0, 3) + "|" + k.slice(3);
  }

  function parseCoords(text) {
    const out = [];

    (String(text || "").match(/\d{3}\s*\|\s*\d{3}|\d{3}\s*[,; ]\s*\d{3}/g) || []).forEach(s => {
      const m = s.match(/(\d{3})\D+(\d{3})/);
      if (m) out.push(m[1] + "|" + m[2]);
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

  function resolveIconUrl(url) {
    url = String(url || "").trim();

    if (!url) return "";

    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    if (url.startsWith("/")) return url;

    return "/graphic/unit_map/" + url.replace(/^\/+/, "");
  }

  function coordsToText(group) {
    return Object.keys(group.coords || {}).map(coordText).sort().join("\n");
  }

  function removeCoordFromAll(coord) {
    for (const g of Object.values(groups)) {
      delete g.coords[coord];
    }
  }

  function findCoordByVillageId(id) {
    for (const [k, v] of Object.entries(TWMap.villages || {})) {
      if (String(v.id) === String(id)) return coordText(k);
    }

    return null;
  }

  function coordFromEvent(e) {
    try {
      const map = document.getElementById("map");
      const r = map.getBoundingClientRect();
      const px = e.clientX - r.left + TWMap.map.pos[0];
      const py = e.clientY - r.top + TWMap.map.pos[1];
      const co = TWMap.map.coordByPixel(px, py);

      if (co && co.length >= 2) return co[0] + "|" + co[1];
    } catch (err) {}

    return null;
  }

  function clearMarks() {
    document.querySelectorAll(".twm_mark").forEach(e => e.remove());
  }

  function markImg(img, coord, group, isActive) {
    if (!img || !img.parentElement) return;

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

    let z = parseInt(img.style.zIndex || getComputedStyle(img).zIndex || 5);
    if (isNaN(z)) z = 5;

    const bgOpacity = isActive ? 0.42 : 0.20;
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
      "color:white;" +
      "font-weight:bold;" +
      "font-size:14px;" +
      "text-shadow:1px 1px 2px #000,-1px -1px 2px #000;" +
      "line-height:1;" +
      "text-align:center;" +
      "overflow:hidden;" +
      "filter:" + brightness + ";";

    const iconUrl = resolveIconUrl(group.icon);

    if (iconUrl) {
      const icon = document.createElement("img");

      icon.src = iconUrl;
      icon.alt = group.text || group.name || "";
      icon.style.cssText =
        "max-width:20px;" +
        "max-height:20px;" +
        "width:auto;" +
        "height:auto;" +
        "pointer-events:none;";

      icon.onerror = function () {
        if (this.src.includes(".png")) {
          this.src = this.src.replace(".png", ".webp");
        } else {
          this.remove();
          box.textContent = group.text || "";
        }
      };

      box.appendChild(icon);
    } else {
      box.textContent = group.text || "";
    }

    parent.appendChild(box);
  }

  function draw() {
    clearMarks();

    for (const group of Object.values(groups)) {
      const isActive = group.id === activeGroupId;

      for (const coord of Object.keys(group.coords || {})) {
        const v = TWMap.villages[keyOf(coord)];
        if (!v || !v.id) continue;

        const img = document.getElementById("map_village_" + v.id);
        if (img) markImg(img, coord, group, isActive);
      }
    }

    movePanelsToHost();
    refreshAllPanels();
  }

  function totalAll() {
    let total = 0;

    for (const g of Object.values(groups)) {
      total += Object.keys(g.coords || {}).length;
    }

    return total;
  }

  function setActiveGroup(id) {
    activeGroupId = id;
    refreshAllPanels();
    draw();
  }

  function drag(panel, header) {
    let ox = 0;
    let oy = 0;
    let on = false;

    header.style.cursor = "move";

    header.onmousedown = e => {
      if (e.target.tagName === "BUTTON") return;

      on = true;
      ox = e.clientX - panel.offsetLeft;
      oy = e.clientY - panel.offsetTop;

      e.preventDefault();
    };

    document.addEventListener("mousemove", e => {
      if (!on) return;

      panel.style.left = e.clientX - ox + "px";
      panel.style.top = e.clientY - oy + "px";
      panel.style.right = "auto";
    });

    document.addEventListener("mouseup", () => {
      on = false;
    });
  }

  function iconOptionsHtml() {
    return (
      '<option value="">Sem ícone</option>' +
      '<option value="/graphic/unit_map/spear.png">Lança</option>' +
      '<option value="/graphic/unit_map/sword.png">Espada</option>' +
      '<option value="/graphic/unit_map/axe.png">Machado</option>' +
      '<option value="/graphic/unit_map/archer.webp">Arqueiro</option>' +
      '<option value="/graphic/unit_map/spy.webp">Espião</option>' +
      '<option value="/graphic/unit_map/light.png">Leve</option>' +
      '<option value="/graphic/unit_map/marcher.png">Arq. montado</option>' +
      '<option value="/graphic/unit_map/heavy.webp">Pesada</option>' +
      '<option value="/graphic/unit_map/ram.webp">Aríete</option>' +
      '<option value="/graphic/unit_map/catapult.webp">Catapulta</option>' +
      '<option value="/graphic/unit_map/knight.png">Paladino</option>' +
      '<option value="/graphic/unit_map/snob.png">Nobre</option>' +
      '<option value="/graphic/unit_map/militia.webp">Milícia</option>' +
      '<option value="custom">Personalizado</option>'
    );
  }

  function createMainPanel() {
    const p = document.createElement("div");

    p.id = "twm_main_panel";
    p.className = "twm_main_panel";

    p.style.cssText =
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

    p.innerHTML =
      '<div id="twm_main_head" style="background:#d7bd82;padding:6px;font-weight:bold;">' +
        'Marcador V7 ' +
        '<button id="twm_close_all" style="float:right">X</button>' +
      '</div>' +
      '<div style="padding:7px">' +
        '<button id="twm_new_group">Novo grupo</button> ' +
        '<button id="twm_click_mode">Modo clique: OFF</button> ' +
        '<button id="twm_clear_all">Limpar tudo</button>' +
        '<div id="twm_main_info" style="margin-top:6px;font-size:11px"></div>' +
      '</div>';

    host().appendChild(p);
    drag(p, document.getElementById("twm_main_head"));

    document.getElementById("twm_new_group").onclick = function () {
      const id = "g" + Date.now();

      groups[id] = {
        id,
        name: "Novo grupo",
        color: "#ff0000",
        text: "",
        icon: "",
        coords: {}
      };

      activeGroupId = id;
      createGroupPanel(groups[id]);
      draw();
    };

    document.getElementById("twm_click_mode").onclick = function () {
      clickMode = !clickMode;
      this.textContent = "Modo clique: " + (clickMode ? "ON" : "OFF");
      this.style.fontWeight = clickMode ? "bold" : "normal";
    };

    document.getElementById("twm_clear_all").onclick = function () {
      if (!confirm("Apagar todas as marcações de todos os grupos?")) return;

      for (const g of Object.values(groups)) {
        g.coords = {};
      }

      draw();
    };

    document.getElementById("twm_close_all").onclick = function () {
      document.querySelectorAll(".twm_mark,.twm_panel,.twm_main_panel").forEach(e => e.remove());

      if (w.__twm_interval) clearInterval(w.__twm_interval);
      if (w.__twm_fullscreen_listener) {
        document.removeEventListener("fullscreenchange", w.__twm_fullscreen_listener);
      }
      if (w.__twm_click_listener) {
        document.removeEventListener("click", w.__twm_click_listener, true);
      }
    };
  }

  function createGroupPanel(group) {
    groupIndex++;

    const p = document.createElement("div");

    p.id = "twm_panel_" + group.id;
    p.className = "twm_panel";
    p.dataset.group = group.id;

    const top = 170 + groupIndex * 34;
    const right = 18 + (groupIndex % 2) * 355;

    p.style.cssText =
      "position:fixed;" +
      "right:" + right + "px;" +
      "top:" + top + "px;" +
      "z-index:2147483647;" +
      "background:#f4e4bc;" +
      "border:2px solid #7d510f;" +
      "box-shadow:0 0 8px #000;" +
      "color:#000;" +
      "font-size:12px;" +
      "width:335px;";

    p.innerHTML =
      '<div class="twm_head" style="background:#d7bd82;padding:6px;font-weight:bold;">' +
        '<span class="twm_title"></span>' +
        '<button class="twm_del_group" style="float:right;margin-left:4px">Excluir</button>' +
        '<button class="twm_set_active" style="float:right">Editar</button>' +
      '</div>' +
      '<div style="padding:7px">' +
        'Nome: <input class="twm_name" style="width:115px"> ' +
        'Cor: <input class="twm_color" type="color"> ' +
        'Texto: <input class="twm_text_symbol" maxlength="6" style="width:42px">' +
        '<br>' +
        'Ícone: <select class="twm_icon_preset" style="width:110px;margin-top:5px">' +
          iconOptionsHtml() +
        '</select> ' +
        'URL: <input class="twm_icon_url" placeholder="/graphic/unit_map/snob.png" style="width:170px">' +
        '<textarea class="twm_coords" style="width:315px;height:80px;margin-top:6px" placeholder="Coords deste grupo. Ex: 565|526"></textarea>' +
        '<br>' +
        '<button class="twm_add_coords">Adicionar coords</button> ' +
        '<button class="twm_copy_coords">Copiar</button> ' +
        '<button class="twm_clear_group">Limpar grupo</button>' +
        '<div class="twm_info" style="margin-top:5px;font-size:11px"></div>' +
      '</div>';

    host().appendChild(p);
    drag(p, p.querySelector(".twm_head"));

    const name = p.querySelector(".twm_name");
    const color = p.querySelector(".twm_color");
    const text = p.querySelector(".twm_text_symbol");
    const iconPreset = p.querySelector(".twm_icon_preset");
    const iconUrl = p.querySelector(".twm_icon_url");
    const coords = p.querySelector(".twm_coords");

    name.value = group.name;
    color.value = group.color;
    text.value = group.text || "";
    iconUrl.value = group.icon || "";
    coords.value = coordsToText(group);

    const presetValues = [...iconPreset.options].map(o => o.value);
    iconPreset.value = presetValues.includes(group.icon || "") ? (group.icon || "") : "custom";

    function saveGroupFields() {
      group.name = name.value.trim() || group.name;
      group.color = color.value || group.color;
      group.text = text.value.trim() || "";
      group.icon = iconUrl.value.trim() || "";
    }

    [name, color, text, iconUrl].forEach(el => {
      el.addEventListener("change", function () {
        saveGroupFields();
        draw();
      });
    });

    iconPreset.onchange = function () {
      if (this.value !== "custom") {
        iconUrl.value = this.value;
        saveGroupFields();
        draw();
      }
    };

    p.querySelector(".twm_set_active").onclick = function () {
      saveGroupFields();
      setActiveGroup(group.id);
    };

    p.querySelector(".twm_add_coords").onclick = function () {
      saveGroupFields();

      const parsed = parseCoords(coords.value);

      if (!parsed.length) {
        alert("Nenhuma coordenada encontrada. Use 565|526.");
        return;
      }

      parsed.forEach(c => {
        removeCoordFromAll(c);
        group.coords[c] = 1;
      });

      coords.value = coordsToText(group);
      draw();
    };

    p.querySelector(".twm_copy_coords").onclick = function () {
      navigator.clipboard?.writeText(coordsToText(group));
    };

    p.querySelector(".twm_clear_group").onclick = function () {
      if (!confirm('Limpar grupo "' + group.name + '"?')) return;

      group.coords = {};
      coords.value = "";
      draw();
    };

    p.querySelector(".twm_del_group").onclick = function () {
      if (Object.keys(groups).length <= 1) {
        alert("Precisa ter pelo menos 1 grupo.");
        return;
      }

      if (!confirm('Excluir grupo "' + group.name + '"?')) return;

      delete groups[group.id];
      p.remove();

      if (activeGroupId === group.id) {
        activeGroupId = Object.keys(groups)[0];
      }

      draw();
    };

    refreshGroupPanel(group);
  }

  function refreshGroupPanel(group) {
    const p = document.getElementById("twm_panel_" + group.id);
    if (!p) return;

    const isActive = group.id === activeGroupId;
    const count = Object.keys(group.coords || {}).length;

    p.querySelector(".twm_title").textContent =
      (isActive ? "EDITANDO: " : "Grupo: ") + group.name + " (" + count + ")";

    p.querySelector(".twm_info").textContent =
      "Coords: " + count + (isActive ? " | ativo para clique" : " | inativo");

    p.querySelector(".twm_coords").value = coordsToText(group);

    if (isActive) {
      p.style.opacity = "1";
      p.style.filter = "brightness(1)";
      p.style.borderColor = group.color;
    } else {
      p.style.opacity = "0.58";
      p.style.filter = "brightness(0.72)";
      p.style.borderColor = "#7d510f";
    }
  }

  function refreshAllPanels() {
    for (const g of Object.values(groups)) {
      refreshGroupPanel(g);
    }

    const info = document.getElementById("twm_main_info");
    if (info) {
      const active = groups[activeGroupId];
      info.textContent =
        "Editando: " +
        (active ? active.name : "-") +
        " | Total geral: " +
        totalAll();
    }
  }

  w.__twm_click_listener = function (e) {
    if (!clickMode) return;
    if (e.target.closest(".twm_panel,.twm_main_panel")) return;

    const active = groups[activeGroupId];
    if (!active) return;

    let coord = null;
    const img = e.target.closest('img[id^="map_village_"]');

    if (img) {
      coord = findCoordByVillageId(img.id.replace("map_village_", ""));
    }

    if (!coord) coord = coordFromEvent(e);
    if (!coord || !TWMap.villages[keyOf(coord)]) return;

    e.preventDefault();
    e.stopPropagation();

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
    setTimeout(() => {
      movePanelsToHost();
      draw();
    }, 150);
  };

  document.addEventListener("fullscreenchange", w.__twm_fullscreen_listener);

  createMainPanel();

  Object.values(groups).forEach(g => createGroupPanel(g));

  w.__twm_interval = setInterval(draw, 800);

  draw();
})();
