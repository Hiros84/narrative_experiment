// Main JS logic for node/graph editor

// Data
window.nodes = [];
window.links = [];
window.selectedNode = null;

// SVG setup
const width = 800, height = 600;
// svg, linkLayer, gLayer will be declared after DOMContentLoaded
let svg, linkLayer, gLayer;
let zoom;

// Drag behavior
const drag = d3.drag()
  .on("start", function (event, d) {
    d3.select(this).raise().attr("stroke", "black");
  })
  .on("drag", function (event, d) {
    d.x = event.x;
    d.y = event.y;
    d3.select(this)
      .attr("transform", `translate(${d.x},${d.y})`);
    updateLinks();
  })
  .on("end", function (event, d) {
    d3.select(this).attr("stroke", null);
  });

// Update links
function updateLinks() {
  const link = linkLayer.selectAll("line.link")
    .data(window.links, d => d.source.id + "-" + d.target.id);
  link.enter()
    .append("line")
    .attr("class", "link")
    .attr("stroke", "#999")
    .attr("stroke-width", 2)
    .on("click", function(event, d) {
      event.stopPropagation();
      const index = window.links.indexOf(d);
      if (index > -1) {
        window.links.splice(index, 1);
        updateLinks();
      }
    })
    .merge(link)
    .attr("x1", d => d.source.x)
    .attr("y1", d => d.source.y)
    .attr("x2", d => d.target.x)
    .attr("y2", d => d.target.y);
  link.exit().remove();
}

const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

// Render nodes
function renderNodes() {
  const color = d3.scaleOrdinal(d3.schemeCategory10);
  updateLinks();
  const nodeSel = gLayer.selectAll("g.node")
    .data(window.nodes, d => d.id);

  const nodeEnter = nodeSel.enter()
    .append("g")
    .attr("class", "node")
    .call(drag);

  nodeEnter.each(function(d) {
    const nodeGroup = d3.select(this);
    if (d.Rep === 1 && d.icon) {
      const size = 60; // 好きなサイズ
      nodeGroup.append("image")
        .attr("href", d.icon)
        .attr("x", -size / 2)
        .attr("y", -size / 2)
        .attr("width", size)
        .attr("height", size)
        .attr("preserveAspectRatio", "xMidYMid meet");
    } else {
      nodeGroup.append("circle")
        .attr("r", 6)
        .attr("fill", d => color(d.cluster))
        .attr("stroke", "#333")
        .attr("stroke-width", 0.5);
    }
  });

  nodeSel.merge(nodeEnter)
    .on("click", function (event, d) {
      event.stopPropagation();
      d3.selectAll("rect").attr("stroke", d => color(d.cluster)).attr("stroke-width", 6);

      if (window.selectedNode && window.selectedNode.id !== d.id) {
        // Create link
        window.links.push({ source: window.selectedNode, target: d });
        window.selectedNode = null;
        updateLinks();
      } else {
        window.selectedNode = d;
        d3.select(this).select("rect").attr("stroke", "red").attr("stroke-width", 6);
      }
    })
    .attr("transform", d => `translate(${d.x},${d.y})`);

  nodeSel.exit().remove();

  // D3のdrag挙動を適用（既に定義済みdrag変数を再利用）
  nodeSel.call(drag);
}

// Deselect node on background click
// Will be set after DOMContentLoaded

function updateIconDropdown() {
  const select = document.getElementById("icon-select");
  if (!select) {
    //console.warn("icon-select が存在しないため、スキップしました");
    return;
  }
  console.log("全ノード", window.nodes.map(n => n.icon));
  fetch('/api/images')
    .then(res => res.json())
    .then(allIcons => {
      const usedIcons = new Set(window.nodes.map(n => n.icon.split('/').pop()));
      console.log("使用中のアイコン", usedIcons);

      const unusedIcons = allIcons.filter(icon => !usedIcons.has(icon));
      console.log("未使用のアイコン", unusedIcons);

      select.innerHTML = "";

      unusedIcons.forEach(icon => {
        const option = document.createElement("option");
        option.value = icon;
        option.text = icon.replace('.png', '');
        select.appendChild(option);
      });
    });
}

/**
 * 保存処理（サーバー保存）
 * - 画面上の nodes / links をまとめて { filename, graph:{nodes,links} } 形式で
 *   POST /api/save に送信する。
 * - サーバー側は req.body.graph.nodes / req.body.graph.links を読み取り、
 *   実ファイルには {nodes,links} のフラット構造で書き出す。
 */
function saveToJson() {
  const fileNameInput = document.getElementById("filename-input");
  const fileName = fileNameInput.value.trim();
  if (!fileName) {
    alert("ファイル名を入力してください。");
    return;
  }

  const simplifiedLinks = window.links.map(link => ({
    source: link.source.id,
    target: link.target.id
  }));
  const data = {
    nodes: window.nodes.map(n => ({ id: n.id, icon: n.icon, x: n.x, y: n.y })),
    links: simplifiedLinks
  };
  // 現在のズーム状態を取得して保存
  const currentTransform = d3.zoomTransform(svg.node());
  data.view = {
    k: currentTransform.k,
    x: currentTransform.x,
    y: currentTransform.y
  };

  console.log("==== 保存直前のデータ ====");
  console.log("window.links:", JSON.stringify(window.links, null, 2));
  console.log("simplifiedLinks:", JSON.stringify(simplifiedLinks, null, 2));
  console.log("data:", JSON.stringify(data, null, 2));


  fetch("/api/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: fileName, graph: data })  // graph キーの下に {nodes, links} をまとめて送る（サーバーは req.body.graph.* を参照）
  })
  .then(response => {
    if (!response.ok) throw new Error("保存に失敗しました");
    alert("保存しました！");
    fetchJsonFileList(); // 保存後に一覧を更新
  })
  .catch(err => {
    console.error(err);
    alert("エラーが発生しました: " + err.message);
  });

  console.log("saveToJson() が呼び出されました");
  console.log("保存前リンクデータ", window.links);
  console.log("簡略化リンクデータ", simplifiedLinks);

}

// Backward-compat: keep old name working
window.saveJson = saveToJson;

// ボタンのイベントリスナーと初期化処理
document.addEventListener("DOMContentLoaded", function () {
  // Select svg and layers once DOM is loaded
  svg = d3.select("#mysvg");
  const viewport = svg.select("g.viewport");
  linkLayer = viewport.select("g.link-layer");
  gLayer = viewport.select("g.node-layer");

  // Deselect node on background click
  svg.on("click", function () {
    window.selectedNode = null;
    d3.selectAll("rect").attr("stroke", "#888").attr("stroke-width", 2);
  });

  console.log("DOMContentLoaded 実行");
  updateIconDropdown();

  const saveBtn = document.getElementById("save-btn");
  if (saveBtn) {
    console.log("保存ボタンが見つかりました");
    // 保存ボタン → サーバー保存 saveToJson()
    saveBtn.addEventListener("click", function () {
      console.log("保存ボタンがクリックされました");
      saveToJson();
    });
  } else {
    console.error("保存ボタンが見つかりません！");
  }

  const loadBtn = document.getElementById("load-btn");
  if (loadBtn) {
    console.log("読込ボタンが見つかりました");
    loadBtn.addEventListener("click", function () {
      console.log("読込ボタンがクリックされました");
      loadSelectedJson();
    });
  } else {
    console.error("読込ボタンが見つかりません！");
  }

  fetchJsonFileList();  // 保存済みの .json ファイル一覧を取得

  // Initial render
  renderNodes();

  // ==== D3でズーム操作ボタンを生成 ====
  const zoomGroup = d3.select("#canvas-container")
    .append("div")
    .attr("id", "zoom-controls")
    .style("position", "absolute")
    .style("top", "10px")
    .style("right", "10px")
    .style("background", "rgba(255,255,255,0.8)")
    .style("border", "1px solid #ccc")
    .style("border-radius", "4px")
    .style("padding", "5px");

  zoom = d3.zoom()
    .scaleExtent([0.5, 3])
    .on("zoom", event => {
      const viewport = svg.select("g.viewport");
      viewport.attr("transform", event.transform);
    });

  const zoomIn = zoomGroup.append("button")
    .text("+")
    .style("margin", "2px")
    .on("click", () => {
      svg.transition().duration(200).call(zoom.scaleBy, 1.2);
    });

  const zoomOut = zoomGroup.append("button")
    .text("-")
    .style("margin", "2px")
    .on("click", () => {
      svg.transition().duration(200).call(zoom.scaleBy, 0.8);
    });

  const zoomReset = zoomGroup.append("button")
    .text("Reset")
    .style("margin", "2px")
    .on("click", () => {
      svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
    });
});


// JSONファイル一覧を取得してセレクトボックスに反映
function fetchJsonFileList() {
  fetch('/api/list')
    .then(res => res.json())
    .then(files => {
      const select = document.getElementById('json-file-list');
      select.innerHTML = '';  // 既存の内容をクリア

      files.forEach(file => {
        const option = document.createElement('option');
        option.value = file;
        option.textContent = file;
        select.appendChild(option);
      });
    })
    .catch(err => {
      console.error('ファイル一覧の取得に失敗:', err);
    });
}

// 選択されたファイルを読み込む
function loadSelectedJson() {
  const select = document.getElementById('json-file-list');
  const selectedFile = select.value;
  if (!selectedFile) return;

  fetch(`/api/load/${encodeURIComponent(selectedFile)}`)
    .then(res => res.json())
    .then(data => loadFromJson(data))
    .catch(err => {
      console.error("読み込み失敗:", err);
      alert("読み込みに失敗しました");
    });
}


//取得したJSONデータを読み込んで画面に反映する
function loadFromJson(data) {
  if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.links)) {
    console.error("不正なデータ形式:", data);
    alert("読み込んだデータの形式が正しくありません");
    return;
  }

  window.nodes = (data.nodes || []).map(n => {
    return {
      ...n,
      icon: n.icon
    };
  });

  // ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼
  //           ここからが座標スケーリングの追加部分
  // ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼

  // 1. 読み込んだノードの現在のx座標とy座標の範囲を計算します
  // 例: xが-50から80、yが120から300の範囲に分布している、などを把握します
  const xExtent = d3.extent(window.nodes, d => d.x);
  const yExtent = d3.extent(window.nodes, d => d.y);

  // 2. 描画したいキャンバスのサイズを定義します（余白も考慮）
  // この値は index.html の <svg> タグの width/height と合わせます
  const svgWidth = 2000;
  const svgHeight = 1480;
  const padding = 100; // キャンバスの端にノードがくっつきすぎないように余白を設定

  // 3. 元の座標範囲を、キャンバスのサイズに変換するための「スケール（物差し）」を作成します
  // d3.scaleLinear()が、古い目盛りの物差しを新しい目盛りの物差しに変換してくれます
  const xScale = d3.scaleLinear()
    .domain(xExtent) // 入力値の範囲 (例: [-50, 80])
    .range([padding, svgWidth - padding]); // 出力したい値の範囲 (例: [100, 1900])

  const yScale = d3.scaleLinear()
    .domain(yExtent) // 入力値の範囲 (例: [120, 300])
    .range([padding, svgHeight - padding]); // 出力したい値の範囲 (例: [100, 1380])

  // 4. すべてのノードの座標を、新しいスケールを使って更新します
  window.nodes.forEach(node => {
    node.x = xScale(node.x);
    node.y = yScale(node.y);
  });

  // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
  //             ここまでが座標スケーリングの追加部分
  // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

  // リンク情報を再構築
  window.links = [];
  const nodeMap = new Map();
  window.nodes.forEach(node => nodeMap.set(node.id, node));

  window.links = data.links.map(link => {
    return {
      source: nodeMap.get(link.source),
      target: nodeMap.get(link.target)
    };
  }).filter(link => link.source && link.target);

  // 最後に、更新された座標でノードとリンクを描画します
  // console.log("=== 読み込んだデータ ===");
  // console.log("ノード数:", window.nodes.length);
  // console.log("リンク数:", window.links.length);
  // console.log("最初のノード:", window.nodes[0]);
  renderNodes();
  updateLinks();
  // ==== ズーム位置と倍率を復元 ====
  if (data.view) {
    const { k, x, y } = data.view;
    const transform = d3.zoomIdentity.translate(x, y).scale(k);
    svg.call(zoom.transform, transform);
  } else {
    svg.call(zoom.transform, d3.zoomIdentity);
  }
}

function loadJson() {
  const input = document.getElementById("load-filename-input");
  const raw = String(input.value).trim();
  if (!raw) {
    alert("読み込むファイル名を入力してください。");
    return;
  }
  const filename = raw.toLowerCase().endsWith(".json") ? raw : raw + ".json";

  fetch(`/api/load/${encodeURIComponent(filename)}`)
    .then(response => {
      if (!response.ok) {
        throw new Error("ファイルが見つかりません");
      }
      return response.json();
    })
    .then(data => {
      loadFromJson(data);
    })
    .catch(error => {
      console.error("読み込みエラー:", error);
      alert("読み込みに失敗しました: " + error.message);
    });
}