// SVG とズーム設定
const svg = d3.select("#mysvg");
const gLayer = svg.select("g.zoom-layer");

// D3のドラッグ動作を定義
const drag = d3.drag()
  .on("start", function(event, d) {
    d3.select(this).classed("dragging", true);
  })
  .on("drag", function(event, d) {
    d.x += event.dx;
    d.y += event.dy;
    d3.select(this)
      .attr("transform", `translate(${d.x},${d.y})`);
    updateLinks();
  })
  .on("end", function(event, d) {
    d3.select(this).classed("dragging", false);
  });

function updateLinks() {
  const linkLayer = d3.select("g.link-layer");
  if (!window.links || !window.nodes) return;

  // source, target をノードオブジェクトに変換
  const nodeById = new Map(window.nodes.map(d => [d.id, d]));
  const links = window.links.map(d => ({
    source: typeof d.source === "object" ? d.source : nodeById.get(d.source),
    target: typeof d.target === "object" ? d.target : nodeById.get(d.target)
  })).filter(d => d.source && d.target);

  const linkSel = linkLayer.selectAll("line").data(links);

  linkSel.enter()
    .append("line")
    .attr("stroke", "#aaa")
    .attr("stroke-width", 1)
    .merge(linkSel)
    .attr("x1", d => d.source.x)
    .attr("y1", d => d.source.y)
    .attr("x2", d => d.target.x)
    .attr("y2", d => d.target.y);

  linkSel.exit().remove();

  // 追加: リンクがクリックを妨げないように pointer-events を無効化
  linkLayer.selectAll('line').style('pointer-events', 'none');
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
        nodeGroup.append("circle")
          .attr("r", 10)
          .attr("fill", colorScale(d.cluster))
          .attr("stroke", "#fff")
          .attr("stroke-width", 1.5);
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

    nodeUpdate.attr("transform", d => `translate(${d.x},${d.y})`);

    nodeUpdate.on("click", function(event, d) {
        this.parentNode.appendChild(this); 
        event.stopPropagation();
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

    // data の形が {nodes,links} または {graph:{nodes,links}} のどちらにも対応
    const nodes = Array.isArray(data.nodes) ? data.nodes : (data.graph && Array.isArray(data.graph.nodes) ? data.graph.nodes : []);
    const links = Array.isArray(data.links) ? data.links : (data.graph && Array.isArray(data.graph.links) ? data.graph.links : []);

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

  // 起動時に一覧を取得
  fetchJsonFileList();
});