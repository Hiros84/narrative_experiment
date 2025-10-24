// SVG とズーム設定
const svg = d3.select("#mysvg");
const gLayer = svg.select("g.zoom-layer");

// --- ノード選択ハイライト用: SVGにglowフィルタを追加 ---
const defs = svg.append("defs");
const filter = defs.append("filter").attr("id", "glow");
filter.append("feGaussianBlur").attr("stdDeviation", 4).attr("result", "coloredBlur");
const feMerge = filter.append("feMerge");
feMerge.append("feMergeNode").attr("in", "coloredBlur");
feMerge.append("feMergeNode").attr("in", "SourceGraphic");

// === D3 Zoom 設定: transformをg.viewportに適用 ===
const zoom = d3.zoom().on("zoom", (event) => {
    svg.select("g.viewport").attr("transform", event.transform);
});
svg.call(zoom);

// グローバル: アクティブなノード（リンク作成用）
window.activeNode = null;

// D3のドラッグ動作を定義（楕円ノード用: 移動・リサイズ・回転対応）
const drag = d3.drag()
  .on("start", function(event, d) {
    d3.select(this).classed("dragging", true);
    // 楕円の回転用: 開始時の角度とポインタ座標を覚えておく
    if (d.type === "ellipse") {
      d._dragStart = {
        x: d.x,
        y: d.y,
        rx: d.rx,
        ry: d.ry,
        angle: d.angle || 0,
        pointer: [event.x, event.y]
      };
    }
  })
  .on("drag", function(event, d) {
    // --- 楕円ノード: 移動・リサイズ・回転 ---
    if (d.type === "ellipse") {
      const minRx = 10, minRy = 10;
      const dragStart = d._dragStart || {};
      // Shift: リサイズ
      if (event.sourceEvent.shiftKey) {
        // Resize based on drag direction
        // Calculate drag vector in local ellipse axes
        // Use dx,dy in screen space as increment to rx, ry
        let dx = event.x - dragStart.pointer[0];
        let dy = event.y - dragStart.pointer[1];
        // Optionally, resize along the axis with larger movement
        // Here, allow proportional resizing (rx: dx, ry: dy)
        d.rx = Math.max(minRx, dragStart.rx + dx);
        d.ry = Math.max(minRy, dragStart.ry + dy);
      }
      // Alt: 回転
      else if (event.sourceEvent.altKey) {
        // Calculate angle from ellipse center to mouse
        const cx = dragStart.x;
        const cy = dragStart.y;
        const x0 = dragStart.pointer[0], y0 = dragStart.pointer[1];
        const x1 = event.x, y1 = event.y;
        // Angle from center to start
        const a0 = Math.atan2(y0 - cy, x0 - cx);
        // Angle from center to current
        const a1 = Math.atan2(y1 - cy, x1 - cx);
        // Angle delta in degrees
        let delta = (a1 - a0) * 180 / Math.PI;
        d.angle = ((dragStart.angle || 0) + delta) % 360;
        if (d.angle < 0) d.angle += 360;
      }
      // 通常ドラッグ: 移動
      else {
        d.x = dragStart.x + event.x - dragStart.pointer[0];
        d.y = dragStart.y + event.y - dragStart.pointer[1];
      }
      // 更新
      d3.select(this)
        .attr("transform", `translate(${d.x},${d.y}) rotate(${d.angle || 0})`);
      // 楕円自体のサイズも反映
      d3.select(this).select("ellipse")
        .attr("rx", d.rx)
        .attr("ry", d.ry);
      updateLinks();
      return;
    }
    // --- それ以外のノード: 移動のみ ---
    d.x += event.dx;
    d.y += event.dy;
    d3.select(this)
      .attr("transform", `translate(${d.x},${d.y})`);
    updateLinks();
  })
  .on("end", function(event, d) {
    d3.select(this).classed("dragging", false);
    if (d.type === "ellipse") {
      delete d._dragStart;
    }
  });

function updateLinks() {
  const linkLayer = d3.select("g.link-layer");
  if (!window.links || !window.nodes) return;

  // Build node lookup by id
  const nodeById = new Map(window.nodes.map(d => [d.id, d]));
  // Map links to have source/target as node objects, and keep index for removal
  const links = window.links.map((d, i) => ({
    __linkIndex: i,
    source: typeof d.source === "object" ? d.source : nodeById.get(d.source),
    target: typeof d.target === "object" ? d.target : nodeById.get(d.target)
  })).filter(d => d.source && d.target);

  // Key by source-target-index so that duplicate links are handled
  const linkSel = linkLayer.selectAll("line").data(links, d => d.source.id + "-" + d.target.id + "-" + d.__linkIndex);

  // ENTER
  linkSel.enter()
    .append("line")
    .attr("stroke", "red")
    .attr("stroke-width", 2)
    .on("click", function(event, d) {
      // Remove link from window.links by index
      if (typeof d.__linkIndex === "number") {
        window.links.splice(d.__linkIndex, 1);
        updateLinks();
      }
      event.stopPropagation();
    })
    .on("mouseover", function(event, d) {
      d3.select(this).attr("stroke", "#f66").attr("stroke-width", 3);
    })
    .on("mouseout", function(event, d) {
      d3.select(this).attr("stroke", "red").attr("stroke-width", 2);
    })
    .merge(linkSel)
    .attr("x1", d => d.source.x)
    .attr("y1", d => d.source.y)
    .attr("x2", d => d.target.x)
    .attr("y2", d => d.target.y)
    .style("pointer-events", "auto");

  linkSel.exit().remove();

  // Ensure links are always beneath nodes
  linkLayer.lower();
}

// ▼▼▼ この関数を丸ごと置き換えてください ▼▼▼
async function renderNodes() {
  try {
    console.log("=== renderNodes 開始 ===");
    if (!window.nodes) throw new Error("window.nodes 未定義");
    console.log("nodes件数:", window.nodes.length);
    updateLinks();

    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

    const nodeSel = gLayer.selectAll("g.node")
      .data(window.nodes, d => d.id);

    // --- 新しいノードグループを作成 ---
    const nodeEnter = nodeSel.enter()
      .append("g")
      .attr("class", "node")
      .call(drag);

    // NOTE: Zoom transform is managed globally by D3; do not set transform manually here.

    // --- Repごとに描画（filterを使わずにeachで安定化） ---
    const imageLoadPromises = window.nodes.map(d => {
      return new Promise(resolve => {
        if (d.Rep !== 1 || !d.icon) return resolve();
        const img = new Image();
        img.onload = resolve;
        img.onerror = () => {
          console.warn(`画像の読み込みに失敗しました: ${d.icon}`);
          resolve();
        };
        img.src = d.icon;
      });
    });

    // --- ノード描画 ---
    nodeEnter.each(function(d) {
      if (d.type === "ellipse") {
        const g = d3.select(this);
        g.append("ellipse")
          .attr("cx", 0)
          .attr("cy", 0)
          .attr("rx", d.rx)
          .attr("ry", d.ry)
          .attr("fill", d.color ? d3.color(d.color).copy({opacity: 0.1}) : "rgba(255,0,0,0.1)")
          .attr("stroke", d.color || "#f00")
          .attr("stroke-width", 2)
          .attr("stroke-dasharray", d.dashArray || null);
        // 楕円ノードの回転: <g>にtransform適用（初期角度）
        d3.select(this)
          .attr("transform", `translate(${d.x},${d.y}) rotate(${d.angle || 0})`);
        this.parentNode.insertBefore(this, this.parentNode.firstChild);
        return; // skip other node drawing branches
      }
      if (d.type === "text") {
        const g = d3.select(this);
        g.append("text")
          .attr("x", 0)
          .attr("y", 0)
          .attr("text-anchor", "middle")
          .style("font-size", (d.fontSize ? d.fontSize : 20) + "px")
          .style("fill", d.color || "#000")
          .text(d.text);
        d3.select(this)
          .attr("transform", `translate(${d.x},${d.y})`);
        return;
      }
      const nodeGroup = d3.select(this);
      if (d.Rep == 1) {
        nodeGroup.append("rect")
          .attr("x", -50)
          .attr("y", -50)
          .attr("width", 100)
          .attr("height", 100)
          .attr("fill", "#eee")
          .attr("stroke", colorScale(d.cluster))
          .attr("stroke-width", 6);

        nodeGroup.append("image")
          .attr("href", d.icon)
          .attr("x", -50)
          .attr("y", -50)
          .attr("width", 100)
          .attr("height", 100)
          .attr("preserveAspectRatio", "xMidYMid meet");

        nodeGroup.append("text")
          .attr("x", 0)
          .attr("y", 70)
          .attr("text-anchor", "middle")
          .style("font-size", "12px")
          .style("fill", "#333")
          .text(d.id);
      } else {
        // === 一時的に点の代わりに品番名を表示 ===
        // nodeGroup.append("circle")
        //   .attr("r", 10)
        //   .attr("fill", colorScale(d.cluster))
        //   .attr("stroke", "#fff")
        //   .attr("stroke-width", 1.5);
        nodeGroup.append("text")
          .attr("text-anchor", "middle")
          .attr("alignment-baseline", "middle")
          .style("font-size", "20px")
          .style("font-weight", "bold")
          .style("fill", colorScale(d.cluster))
          .text(d.id || "");
      }
    });

    // === 全画像のロード完了を待つ ===
    await Promise.all(imageLoadPromises);
    console.log("✅ 全画像読み込み完了");

    await new Promise(requestAnimationFrame); // Ensure DOM updates applied
    await new Promise(resolve => setTimeout(resolve, 50)); // short delay to guarantee layout flush

    console.log("📦 BBox計測直前: gLayer children =", gLayer.node().children.length);
    const bounds = gLayer.node().getBBox();
    if (!bounds || bounds.width === 0 || bounds.height === 0) {
      console.warn("⚠️ BBox が空のままです。描画が完了していない可能性があります。");
    } else {
      // 初期ズーム設定は外部で行う
      if (window.resetZoomToFit) window.resetZoomToFit(bounds);
    }

    // --- 更新とイベント処理 ---
    const nodeUpdate = nodeSel.merge(nodeEnter);

    nodeUpdate.attr("transform", d =>
      d.type === "ellipse"
        ? `translate(${d.x},${d.y}) rotate(${d.angle || 0})`
        : `translate(${d.x},${d.y})`
    );

    nodeUpdate.on("click", function(event, d) {
      // --- LINK作成機能 ---
      // 1. すでにリンク作成モード中か？
      if (window.activeNode == null) {
        // Remove all previous highlights
        d3.selectAll(".selected-node").classed("selected-node", false).attr("filter", null);
        // Set as activeNode
        window.activeNode = d;
        d3.select(this).classed("selected-node", true).attr("filter", "url(#glow)");
        // Bring to front
        this.parentNode.appendChild(this);
      } else if (window.activeNode && window.activeNode.id !== d.id) {
        // 2. 別ノードが既に選択されている → リンク作成
        // Remove highlight from previous
        d3.selectAll(".selected-node").classed("selected-node", false).attr("filter", null);
        // Add link
        if (!window.links) window.links = [];
        window.links.push({ source: window.activeNode.id, target: d.id });
        console.log("リンク作成:", window.links);
        window.activeNode = null;
        updateLinks();
      } else if (window.activeNode && window.activeNode.id === d.id) {
        // クリックしたノードが同じ場合はキャンセル
        d3.select(this).classed("selected-node", false).attr("filter", null);
        window.activeNode = null;
      }
      // event.stopPropagation(); // Removed as per instructions
    });

    // --- テキストノードのダブルクリック編集（フォントサイズも編集可能） ---
    nodeUpdate.on("dblclick", function(event, d) {
      if (d.type === "text") {
        event.stopPropagation();
        const newText = prompt("テキストを編集:", d.text || "");
        if (newText !== null && newText.trim() !== "") {
          d.text = newText.trim();
          const newFontSize = prompt("フォントサイズを入力（例: 16）:", d.fontSize || 20);
          if (newFontSize !== null && !isNaN(newFontSize)) {
            d.fontSize = parseFloat(newFontSize);
          }
          const textEl = d3.select(this).select("text");
          textEl.text(d.text);
          textEl.style("font-size", (d.fontSize ? d.fontSize : 20) + "px");
        }
      }
    });

    // --- ツールチップ: ノード hover で表示 ---
    nodeUpdate.on("mouseover", function(event, d) {
      // 条件: プロダクトノード（Rep==1 または iconあり）
      if (d.Rep == 1 || d.icon) {
        let tooltip = document.getElementById("node-tooltip");
        if (!tooltip) {
          tooltip = document.createElement("div");
          tooltip.id = "node-tooltip";
          tooltip.style.position = "absolute";
          tooltip.style.background = "#fff";
          tooltip.style.border = "1px solid #ccc";
          tooltip.style.padding = "8px";
          tooltip.style.borderRadius = "6px";
          tooltip.style.boxShadow = "0 2px 12px rgba(0,0,0,0.13)";
          tooltip.style.pointerEvents = "none";
          tooltip.style.zIndex = "9999";
          document.body.appendChild(tooltip);
        }
        // 画像部分
        let imgHtml = "";
        if (d.icon) {
          imgHtml = `<img src="${d.icon}" alt="" style="width:100px;display:block;margin:auto;">`;
        }
        // テキスト部分
        let label = d.id || d.name || "";
        // クラスター番号（小さくグレーで）
        let clusterHtml = '';
        if (typeof d.cluster !== "undefined") {
          clusterHtml = `<div style="font-size:12px; color:#666; margin-top:2px;">Cluster: ${d.cluster}</div>`;
        }
        tooltip.innerHTML = `${imgHtml}<div style="text-align:center;margin-top:6px;font-size:14px;">${label}</div>${clusterHtml}`;
        // 表示位置
        tooltip.style.display = "block";
        // 画面端で切れないように少しオフセット
        const offsetX = 16, offsetY = 16;
        let left = event.pageX + offsetX;
        let top = event.pageY + offsetY;
        // 右端・下端で切れないように調整
        const maxRight = window.innerWidth - 140;
        const maxBottom = window.innerHeight - 120;
        if (left > maxRight) left = maxRight;
        if (top > maxBottom) top = maxBottom;
        tooltip.style.left = left + "px";
        tooltip.style.top = top + "px";
      }
    });
    nodeUpdate.on("mouseout", function(event, d) {
      const tooltip = document.getElementById("node-tooltip");
      if (tooltip) tooltip.style.display = "none";
    });

    // --- 不要なノードを削除 ---
    nodeSel.exit().remove();

  } catch (e) {
    console.error("renderNodes 中でエラー:", e);
  }
}

// ==== 保存済みJSONの一覧取得 → セレクトに反映 ====
async function fetchJsonFileList() {
  try {
    console.log("ファイル一覧取得開始");
    const res = await fetch('/api/list');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const files = await res.json();
    const sel = document.getElementById('json-file-list');
    if (!sel) {
      console.warn('json-file-list が見つかりません。index.html に <select id="json-file-list"> を用意してください。');
      return;
    }
    sel.innerHTML = '';
    files.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f;
      sel.appendChild(opt);
    });
    console.log("ファイル一覧:", files);
  } catch (e) {
    console.error('ファイル一覧の取得に失敗:', e);
  }
}

// ==== セレクトで選んだJSONを読み込んで描画 ====
async function loadSelectedJson() {
  try {
    const sel = document.getElementById('json-file-list');
    if (!sel || !sel.value) {
      console.warn('読み込むファイルが選択されていません');
      return;
    }
    const filename = sel.value;
    console.log('読み込み開始:', filename);

    const res = await fetch(`/api/load/${encodeURIComponent(filename)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // --- JSONフォーマットの自動判別とパース ---
    let nodes = [];
    let links = [];

    if (Array.isArray(data.nodes) && Array.isArray(data.links)) {
      // 新形式または単純形式
      nodes = data.nodes;
      links = data.links;
    } else if (data.graph && Array.isArray(data.graph.nodes)) {
      // 旧形式: data.graph 配下に格納されている
      nodes = data.graph.nodes;
      links = data.graph.links || [];
    } else if (data.data && Array.isArray(data.data.nodes)) {
      // さらに古い可能性: data.data 配下
      nodes = data.data.nodes;
      links = data.data.links || [];
    } else {
      console.warn("⚠️ JSON形式が認識できません。空のデータとして読み込みます。");
    }

    window.nodes = nodes || [];
    window.links = links || [];

    console.log("=== 読み込んだデータ ===");
    console.log("ノード数:", window.nodes.length);
    console.log("リンク数:", window.links.length);
    console.log("最初のノード:", window.nodes[0]);

    // --- ノード描画完了を待機 ---
    await renderNodes();

    // === 描画完了後に1フレーム待つ ===
    await new Promise(requestAnimationFrame);

    updateLinks();

    // === 画像読み込み完了後にズーム初期化 ===
    if (window.nodes && window.nodes.length > 0) {
      await new Promise(requestAnimationFrame); // DOM更新を待つ
      const bounds = gLayer.node().getBBox();
      console.log("📏 最終bounds:", bounds);
      if (window.resetZoomToFit) {
        window.resetZoomToFit(bounds);
      }
    }

    // ズーム状態の復元（あれば）は行わず、初期ズームは renderNodes 内で設定する
    if (data.view || (data.graph && data.graph.view)) {
      console.log('ズーム復元スキップ（初期ズームはrenderNodesで設定）:', data.view || data.graph.view);
    }

    // すべての描画・スケーリング完了後に出力
    console.log('読み込み完了:', filename);
  } catch (e) {
    console.error('読み込み失敗:', e);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // ... existing DOMContentLoaded handler code ...

  // 読込ボタンのイベント登録
  const loadBtn = document.getElementById('load-btn');
  if (loadBtn) {
    console.log("読込ボタンが見つかりました");
    loadBtn.addEventListener('click', () => {
      console.log("読込ボタンがクリックされました");
      loadSelectedJson();
    });
  } else {
    console.warn('load-btn が見つかりません。index.html に <button id="load-btn">読込</button> を用意してください。');
  }

  // === 楕円追加ボタン ===
  const addEllipseBtn = document.getElementById("add-ellipse-btn");
  if (addEllipseBtn) {
    addEllipseBtn.addEventListener("click", async () => {
      console.log("🟢 楕円追加ボタンが押されました");

      const color = document.getElementById("ellipse-color")?.value || "#888";
      const lineStyle = document.getElementById("line-style")?.value || "solid";
      const dashArray = lineStyle === "dashed" ? "6,4" : null;

      // === 現在のズーム状態を考慮して中央に配置 ===
      const transform = d3.zoomTransform(window.svg.node());
      const svgWidth = +window.svg.attr("width");
      const svgHeight = +window.svg.attr("height");

      // 表示中の中央点をSVG座標系に変換
      const cx = (svgWidth / 2 - transform.x) / transform.k;
      const cy = (svgHeight / 2 - transform.y) / transform.k;

      const newEllipse = {
        id: `ellipse_${Date.now()}`,
        x: cx,
        y: cy,
        rx: 120,
        ry: 80,
        color: color,
        dashArray: dashArray,
        type: "ellipse"
      };

      if (!window.nodes) window.nodes = [];
      window.nodes.push(newEllipse);

      console.log("✅ 楕円ノードを追加:", newEllipse);

      await renderNodes();
    });
  }

  // === テキスト追加ボタン ===
  const addTextBtn = document.getElementById("add-text-btn");
  if (addTextBtn) {
    addTextBtn.addEventListener("click", async () => {
      console.log("🟢 テキスト追加ボタンが押されました");

      const textInput = document.getElementById("text-node-input");
      const textValue = textInput ? textInput.value.trim() : "";
      if (!textValue) {
        console.warn("テキストが空です。追加をキャンセルします。");
        return;
      }

      const color = document.getElementById("ellipse-color")?.value || "#000";

      // === 現在のズーム状態を考慮して中央に配置 ===
      const transform = d3.zoomTransform(window.svg.node());
      const svgWidth = +window.svg.attr("width");
      const svgHeight = +window.svg.attr("height");

      // 表示中の中央点をSVG座標系に変換
      const cx = (svgWidth / 2 - transform.x) / transform.k;
      const cy = (svgHeight / 2 - transform.y) / transform.k;

      const newTextNode = {
        id: `text_${Date.now()}`,
        x: cx,
        y: cy,
        text: textValue,
        color: color,
        type: "text"
      };

      if (!window.nodes) window.nodes = [];
      window.nodes.push(newTextNode);

      console.log("✅ テキストノードを追加:", newTextNode);

      await renderNodes();
    });
  }

  // === 削除ボタン ===
  const deleteNodeBtn = document.getElementById("delete-node-btn");
  if (deleteNodeBtn) {
    deleteNodeBtn.addEventListener("click", async () => {
      // Find currently selected node
      const selected = d3.select(".selected-node").datum && d3.select(".selected-node").datum();
      if (!selected) {
        console.warn("削除対象ノードが選択されていません");
        return;
      }
      if (!window.nodes) window.nodes = [];
      if (!window.deletedNodes) window.deletedNodes = [];
      // Remove from nodes
      const idx = window.nodes.findIndex(n => n.id === selected.id);
      if (idx >= 0) {
        const [removed] = window.nodes.splice(idx, 1);
        window.deletedNodes.push(removed);
        // Remove selection highlight
        d3.selectAll(".selected-node").classed("selected-node", false).attr("filter", null);
        await renderNodes();
        updateLinks();
      }
    });
  }

  // === 復活ボタン ===
  const restoreNodeBtn = document.getElementById("restore-node-btn");
  if (restoreNodeBtn) {
    restoreNodeBtn.addEventListener("click", async () => {
      if (!window.deletedNodes || window.deletedNodes.length === 0) {
        console.warn("復活できるノードがありません");
        return;
      }
      if (!window.nodes) window.nodes = [];
      const restored = window.deletedNodes.pop();
      window.nodes.push(restored);
      await renderNodes();
      updateLinks();
    });
  }

  // === 最背面ボタン ===
  const sendToBackBtn = document.getElementById("send-to-back-btn");
  if (sendToBackBtn) {
    sendToBackBtn.addEventListener("click", () => {
      const group = d3.select(".selected-node");
      const nodeEl = group.node();
      if (!nodeEl) {
        console.warn("最背面に送るノードが選択されていません");
        return;
      }
      // 1) DOM上で最背面へ移動（視覚的に背面）
      const parent = nodeEl.parentNode;
      if (parent && parent.firstChild) {
        parent.insertBefore(nodeEl, parent.firstChild);
      }

      // 2) データ順も先頭に（今後のrenderでも背面になるように）
      const d = group.datum();
      if (d && Array.isArray(window.nodes)) {
        const idx = window.nodes.findIndex(n => n.id === d.id);
        if (idx >= 0) {
          const [moved] = window.nodes.splice(idx, 1);
          window.nodes.unshift(moved);
        }
      }

      // リンクだけ更新（再描画はしない：DOM順を保持するため）
      updateLinks();
    });
  }

  // === 選択解除ボタン ===
  const deselectNodeBtn = document.getElementById("deselect-node-btn");
  if (deselectNodeBtn) {
    deselectNodeBtn.addEventListener("click", () => {
      // 1. 現在選択状態のノードがあれば、クラスとfilter属性を解除
      d3.selectAll(".selected-node").classed("selected-node", false).attr("filter", null);
      // 2. グローバル変数をnullに戻す
      window.activeNode = null;
      // 3. コンソールに出力
      console.log("選択解除しました");
    });
  }

   // === PDF出力ボタン ===
  const pdfSaveBtn = document.getElementById("pdf-save-btn");
  if (pdfSaveBtn) {
    pdfSaveBtn.addEventListener("click", async () => {
      const nameInput = document.getElementById("pdf-filename-save");
      const filename = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : "export";
      const svgElement = document.querySelector("#mysvg");
      if (!svgElement) {
        console.warn("SVG要素 (#mysvg) が見つかりません");
        return;
      }

      const serializer = new XMLSerializer();
      let source = serializer.serializeToString(svgElement);
      if (!source.match(/^<svg[^>]+xmlns=/)) {
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      if (!source.match(/^<svg[^>]+xmlns:xlink=/)) {
        source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
      }

      try {
        const res = await fetch("/api/export-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename, svg: source })
        });
        if (res.ok) {
          const data = await res.json();
          alert(`✅ PDF出力完了: ${data.filepath || filename + ".pdf"}`);
          console.log("PDF出力成功:", data);
        } else {
          console.error("PDF出力エラー:", res.status);
          alert("PDF出力に失敗しました");
        }
      } catch (e) {
        console.error("PDF出力処理中にエラー:", e);
        alert("PDF出力処理中にエラーが発生しました");
      }
    });
  }

  // === 保存ボタン ===
  const saveBtn = document.getElementById("save-btn");
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      try {
        if (!window.nodes) {
          console.warn("保存するノードがありません");
          return;
        }

        // 入力されたファイル名を取得
        const filenameInput = document.getElementById("filename-save");
        const filename = filenameInput ? filenameInput.value.trim() : "";
        if (!filename) {
          alert("保存ファイル名を入力してください。");
          return;
        }

        // ノード全体をJSON化
        const saveData = {
          filename: filename,  // 追加: ファイル名を送信
          nodes: window.nodes.map(n => {
            const obj = {
              id: n.id,
              type: n.type || "node",
              x: n.x,
              y: n.y,
              Rep: n.Rep,
              cluster: n.cluster,
              color: n.color,
              dashArray: n.dashArray,
              rx: n.rx,
              ry: n.ry,
              angle: n.angle,
              text: n.text,
              icon: n.icon || null, // ← 追加：画像パスも保存
            };
            if (n.type === "text") {
              obj.fontSize = n.fontSize;
            }
            return obj;
          }),
          links: window.links || []
        };

        console.log("💾 保存データ:", saveData);

        const res = await fetch("/api/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(saveData)
        });

        if (res.ok) {
          const result = await res.json();
          alert(`✅ 保存完了: ${result.filename}`);
        } else {
          console.error("保存に失敗しました:", res.status);
          alert("保存に失敗しました");
        }
      } catch (e) {
        console.error("保存中にエラー:", e);
        alert("保存中にエラーが発生しました");
      }
    });
  }

  // 起動時に一覧を取得
  fetchJsonFileList();
});