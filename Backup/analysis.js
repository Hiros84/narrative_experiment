
// URLから'file'パラメータを取得
const params = new URLSearchParams(window.location.search);
const fileName = params.get('file');

// fileNameが指定されていない場合はエラーメッセージを表示
if (!fileName) {
    document.body.innerHTML = '<h1>エラー: 分析対象のファイルが指定されていません。</h1>';
    throw new Error("ファイルが指定されていません。");
}

// ファイル名を元にAPIエンドポイントを構築
const apiUrl = `http://127.0.0.1:5000/api/raw_data?file=${encodeURIComponent(fileName)}`;

// ページタイトルと見出しを選択されたファイル名に更新
document.title = `${fileName}の分析ページ`;
document.querySelector('h1').textContent = `${fileName}の分析`;


d3.json(apiUrl).then(data => {
    if (!data) {
        console.error('データの取得に失敗しました。');
        return;
    }
    
    // --- 1. データテーブル作成 ---
    createTable(data);
    
    // --- 2. ヒストグラムのセットアップ ---
    const numericalColumns = ['補整力', '上代', '売上'];
    setupHistogram(data, numericalColumns);

    // --- 3. クロス集計表のセットアップ ---
    const categoricalColumns = ['ブランド名', 'チャネル', '年度', 'シーズン', 'ステップ', 'ワイヤー', 'タイプ', 'シーン1', 'シーン2', 'シルエット', '着用感'];
    setupCrosstab(data, categoricalColumns);

}).catch(error => {
    console.error('Error fetching data:', error);
});

// --- 関数定義 ---

// テーブル作成関数 (変更なし)
function createTable(data) {
    const columns = Object.keys(data[0]);
    const tableContainer = d3.select('#table-container');
    // 既存のテーブルがあれば削除
    tableContainer.select('table').remove();
    const table = tableContainer.append('table');
    const thead = table.append('thead');
    const tbody = table.append('tbody');

    thead.append('tr').selectAll('th').data(columns).enter().append('th').text(d => d);
    const rows = tbody.selectAll('tr').data(data).enter().append('tr');
    rows.selectAll('td').data(row => columns.map(col => row[col])).enter().append('td').text(d => d);
}

// ヒストグラムのセットアップ関数
function setupHistogram(data, columns) {
    const selector = d3.select('#histogram-selector');
    selector.selectAll('option').data(columns).enter().append('option').text(d => d).attr('value', d => d);
    createHistogram(data, columns[0]);
    selector.on('change', function() {
        createHistogram(data, this.value);
    });
}

// ヒストグラム作成関数 (変更なし)
function createHistogram(data, column) {
    d3.select('#histogram-container').select('svg').remove();
    const margin = { top: 20, right: 30, bottom: 40, left: 50 }, width = 400 - margin.left - margin.right, height = 300 - margin.top - margin.bottom;
    const svg = d3.select("#histogram-container").append("svg").attr("width", width + margin.left + margin.right).attr("height", height + margin.top + margin.bottom).append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const x = d3.scaleLinear().domain(d3.extent(data, d => d[column])).nice().range([0, width]);
    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x));
    const bins = d3.bin().value(d => d[column]).domain(x.domain()).thresholds(x.ticks(20))(data);
    const y = d3.scaleLinear().range([height, 0]).domain([0, d3.max(bins, d => d.length)]).nice();
    svg.append("g").call(d3.axisLeft(y));
    svg.selectAll("rect").data(bins).enter().append("rect").attr("x", 1).attr("transform", d => `translate(${x(d.x0)}, ${y(d.length)})`).attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - 1)).attr("height", d => height - y(d.length)).style("fill", "#69b3a2");
}

// クロス集計のセットアップ関数
function setupCrosstab(data, columns) {
    const rowSelector = d3.select('#crosstab-row-selector');
    const colSelector = d3.select('#crosstab-col-selector');

    rowSelector.selectAll('option').data(columns).enter().append('option').text(d => d).attr('value', d => d);
    colSelector.selectAll('option').data(columns).enter().append('option').text(d => d).attr('value', d => d);

    // 初期表示の列を設定（重複しないように）
    rowSelector.property('value', columns[0]);
    colSelector.property('value', columns[1]);
    
    createCrosstab(data, columns[0], columns[1]);

    function update() {
        const rowVar = rowSelector.property('value');
        const colVar = colSelector.property('value');
        createCrosstab(data, rowVar, colVar);
    }

    rowSelector.on('change', update);
    colSelector.on('change', update);
}

// クロス集計表の作成関数
function createCrosstab(data, rowVar, colVar) {
    // d3.rollupでクロス集計
    const crosstabData = d3.rollup(data, v => v.length, d => d[rowVar], d => d[colVar]);
    
    // テーブルのヘッダー（列のカテゴリ）を取得してソート
    const colCategories = [...new Set(data.map(d => d[colVar]))].sort();
    
    const container = d3.select('#crosstab-container');
    container.select('table').remove(); // 既存のテーブルを削除

    const table = container.append('table');
    const thead = table.append('thead');
    const tbody = table.append('tbody');

    // ヘッダー行を作成
    const headerRow = thead.append('tr');
    headerRow.append('th').text(`${rowVar} / ${colVar}`); // 左上のセル
    headerRow.selectAll('.col-header').data(colCategories).enter().append('th').attr('class', 'col-header').text(d => d);

    // データ行を作成
    const rows = tbody.selectAll('tr').data([...crosstabData.entries()]).enter().append('tr');

    // 各行の最初のセル（行のカテゴリ名）
    rows.append('td').text(d => d[0]);

    // 各行のデータセル
    rows.selectAll('.data-cell')
        .data(d => {
            const rowData = d[1]; // Map(colCategory -> count)
            return colCategories.map(colCat => rowData.get(colCat) || 0);
        })
        .enter()
        .append('td')
        .attr('class', 'data-cell')
        .text(d => d);
}