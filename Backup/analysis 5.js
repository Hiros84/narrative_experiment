// --- グローバル変数 ---
let fullData = [];
let scaleConfig = {};
let processedData = [];
let currentTableData = [];

// --- ユーティリティ関数 ---
function sanitizeId(id) {
    return id.replace(/\./g, "_");
}

// --- 初期化処理 ---
const params = new URLSearchParams(window.location.search);
const fileName = params.get('file');

if (!fileName) {
    document.body.innerHTML = '<h1>エラー: 分析対象のファイルが指定されていません。</h1>';
    throw new Error("ファイルが指定されていません。");
}

const apiUrl = `http://127.0.0.1:5000/api/raw_data?file=${encodeURIComponent(fileName)}`;
document.title = `${fileName}の分析ページ`;
document.querySelector('h1').textContent = `${fileName}の分析`;

d3.json(apiUrl).then(data => {
    if (!data || data.length === 0) { return; }

    // ★★★ 最初に「選択」列をデータに追加 ★★★
    fullData = data.map(d => ({ ...d, '選択': 0 }));
    
    createScaleSpecificationUI(Object.keys(fullData[0]));
    d3.select('#apply-scales-button').on('click', updateAnalyses);
    d3.select('#run-spectral-button').on('click', runSpectralClustering);
    d3.select('#filter-apply-button').on('click', applyTableFilter);
    d3.select('#filter-reset-button').on('click', resetTableFilter);
    // ★★★ 新しいボタンのイベントリスナーを設定 ★★★
    d3.select('#deselect-all-button').on('click', deselectAll);
    d3.select('#save-selection-button').on('click', saveSelection);

    clearAnalyses();

}).catch(error => console.error('Error fetching data:', error));


// --- 関数定義 ---

// (createScaleSpecificationUI, guessScale は変更なし)
function createScaleSpecificationUI(columns) {
    const scaleGrid = d3.select('#scale-grid');
    scaleGrid.html('');
    const scaleTypes = [ { id: 'identifier', label: '識別' }, { id: 'categorical', label: '質的' }, { id: 'numerical', label: '量的' }];
    columns.forEach(col => {
        const initialScale = guessScale(col, fullData[0][col]);
        const item = scaleGrid.append('div').attr('class', 'scale-item');
        const header = item.append('div').attr('class', 'scale-item-header');
        header.append('span').text(col);
        const checkboxLabel = header.append('label');
        checkboxLabel.append('input').attr('type', 'checkbox').attr('id', `use-${sanitizeId(col)}`).property('checked', true);
        checkboxLabel.append('span').text('採用');
        const radios = item.append('div').attr('class', 'scale-item-radios');
        scaleTypes.forEach(type => {
            const radioDiv = radios.append('div');
            radioDiv.append('input').attr('type', 'radio').attr('name', `scale-${sanitizeId(col)}`).attr('id', `scale-${sanitizeId(col)}-${type.id}`).attr('value', type.id).property('checked', type.id === initialScale);
            radioDiv.append('label').attr('for', `scale-${sanitizeId(col)}-${type.id}`).text(type.label);
        });
    });
}

function guessScale(columnName, sampleValue) {
    if (columnName === 'Spectral_Cluster') return 'categorical';
    if (['品番', '名前', '写真'].includes(columnName)) return 'identifier';
    if (typeof sampleValue === 'number') return 'numerical';
    return 'categorical';
}

function updateAnalyses() {
    scaleConfig = {};
    const includedColumns = [];
    d3.select('#scale-grid').selectAll('.scale-item').each(function() {
        const colName = d3.select(this).select('.scale-item-header span').text();
        const isUsed = d3.select(this).select(`#use-${sanitizeId(colName)}`).property('checked');
        if (isUsed) {
            includedColumns.push(colName);
            const selectedScale = d3.select(this).select('input[type="radio"]:checked').node().value;
            scaleConfig[colName] = selectedScale;
        }
    });

    // (機械学習データの前処理部分は変更なし)
    const numericalColumns = includedColumns.filter(key => scaleConfig[key] === 'numerical');
    const categoricalColumns = includedColumns.filter(key => scaleConfig[key] === 'categorical');
    const identifierColumns = includedColumns.filter(key => scaleConfig[key] === 'identifier');
    const scaledNumericalData = {};
    numericalColumns.forEach(col => {
        const values = fullData.map(d => d[col]).filter(v => v != null);
        const mean = d3.mean(values);
        const stddev = d3.deviation(values);
        scaledNumericalData[col] = fullData.map(d => (d[col] - mean) / (stddev || 1));
    });
    const oneHotEncodedData = {};
    categoricalColumns.forEach(col => {
        const uniqueValues = [...new Set(fullData.map(d => d[col]).filter(v => v != null))];
        uniqueValues.forEach(val => {
            oneHotEncodedData[`${col}_${val}`] = fullData.map(d => d[col] === val ? 1 : 0);
        });
    });
    processedData = fullData.map((_, i) => {
        const newRow = {};
        identifierColumns.forEach(col => { newRow[col] = fullData[i][col]; });
        numericalColumns.forEach(col => { newRow[col] = scaledNumericalData[col][i]; });
        Object.keys(oneHotEncodedData).forEach(col => { newRow[col] = oneHotEncodedData[col][i]; });
        return newRow;
    });
    console.log("機械学習用に前処理されたデータ:", processedData);

    let columnsForTable = [...includedColumns];
    if (fullData.length > 0 && fullData[0].hasOwnProperty('Spectral_Cluster')) {
        if (!columnsForTable.includes('Spectral_Cluster')) {
            columnsForTable.push('Spectral_Cluster');
        }
    }
    const filteredData = fullData.map(row => {
        let newRow = {};
        columnsForTable.forEach(col => { newRow[col] = row[col]; });
        return newRow;
    });

    currentTableData = filteredData;
    createTable(currentTableData);
    setupTableFilter(currentTableData);
    setupHistogram(fullData, numericalColumns);
    setupCrosstab(fullData, categoricalColumns);
}

// ★★★ テーブル作成関数を修正 ★★★
function createTable(data) {
    d3.select('#table-container').select('p').remove();
    if (data.length === 0 || Object.keys(data[0]).length === 0) {
        d3.select('#table-container').select('table').remove();
        d3.select('#table-container').append('p').text('表示するデータがありません。').style('text-align', 'center').style('margin-top', '50px');
        return;
    }
    const columns = Object.keys(data[0]);
    const tableContainer = d3.select('#table-container');
    tableContainer.select('table').remove();
    const table = tableContainer.append('table');
    const thead = table.append('thead');
    const tbody = table.append('tbody');

    thead.append('tr').selectAll('th').data(columns).enter().append('th').text(d => d);
    
    const rows = tbody.selectAll('tr').data(data).enter().append('tr');

    rows.selectAll('td')
        .data(row => columns.map(col => ({ column: col, value: row[col],品番: row['品番'] })))
        .enter()
        .append('td')
        .html(d => {
            if (d.column === '選択') {
                return `<input type="checkbox" ${d.value == 1 ? 'checked' : ''}>`;
            }
            return d.value;
        })
        .on('click', function(event, d) {
            if (d.column === '選択') {
                // fullDataの該当行の「選択」値を更新
                const originalRow = fullData.find(row => row['品番'] === d.品番);
                if (originalRow) {
                    originalRow['選択'] = originalRow['選択'] == 1 ? 0 : 1;
                }
                // currentTableDataも更新
                const currentRow = currentTableData.find(row => row['品番'] === d.品番);
                if (currentRow) {
                    currentRow['選択'] = currentRow['選択'] == 1 ? 0 : 1;
                }
            }
        });
}


// (setupHistogram, createHistogram, setupCrosstab, createCrosstab, runSpectralClustering, clearAnalyses は変更なし)
function setupHistogram(data, columns) {
    const selector = d3.select('#histogram-selector');
    selector.html('');
    selector.selectAll('option').data(columns).enter().append('option').text(d => d).attr('value', d => d);
    if (columns.length > 0) {
        createHistogram(data, columns[0]);
        selector.on('change', function() { createHistogram(data, this.value); });
    } else {
        d3.select('#histogram-container').select('svg').remove();
    }
}
function createHistogram(data, column) {
    d3.select('#histogram-container').select('svg').remove();
    const margin = { top: 20, right: 30, bottom: 40, left: 50 }, width = 400 - margin.left - margin.right, height = 300 - margin.top - margin.bottom;
    const svg = d3.select("#histogram-container").append("svg").attr("width", width + margin.left + margin.right).attr("height", height + margin.top - margin.bottom).append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const validData = data.filter(d => d[column] != null && !isNaN(d[column]));
    if (validData.length === 0) return;
    const x = d3.scaleLinear().domain(d3.extent(validData, d => d[column])).nice().range([0, width]);
    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x));
    const bins = d3.bin().value(d => d[column]).domain(x.domain()).thresholds(x.ticks(20))(validData);
    const y = d3.scaleLinear().range([height, 0]).domain([0, d3.max(bins, d => d.length)]).nice();
    svg.append("g").call(d3.axisLeft(y));
    svg.selectAll("rect").data(bins).enter().append("rect").attr("x", 1).attr("transform", d => `translate(${x(d.x0)}, ${y(d.length)})`).attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - 1)).attr("height", d => height - y(d.length)).style("fill", "#69b3a2");
}
function setupCrosstab(data, columns) {
    const rowSelector = d3.select('#crosstab-row-selector');
    const colSelector = d3.select('#crosstab-col-selector');
    rowSelector.html('');
    colSelector.html('');
    rowSelector.selectAll('option').data(columns).enter().append('option').text(d => d).attr('value', d => d);
    colSelector.selectAll('option').data(columns).enter().append('option').text(d => d).attr('value', d => d);
    if (columns.length >= 2) {
        rowSelector.property('value', columns[0]);
        colSelector.property('value', columns[1]);
        createCrosstab(data, columns[0], columns[1]);
    } else {
        d3.select('#crosstab-container').select('table').remove();
    }
    function update() { createCrosstab(data, rowSelector.property('value'), colSelector.property('value')); }
    rowSelector.on('change', update);
    colSelector.on('change', update);
}
function createCrosstab(data, rowVar, colVar) {
    if (!rowVar || !colVar) return;
    const crosstabData = d3.rollup(data, v => v.length, d => d[rowVar], d => d[colVar]);
    const colCategories = [...new Set(data.map(d => d[colVar]))].sort((a, b) => a - b);
    const container = d3.select('#crosstab-container');
    container.select('table').remove();
    const table = container.append('table');
    const thead = table.append('thead');
    const tbody = table.append('tbody');
    const headerRow = thead.append('tr');
    headerRow.append('th').text(`${rowVar} / ${colVar}`);
    headerRow.selectAll('.col-header').data(colCategories).enter().append('th').attr('class', 'col-header').text(d => d);
    const rows = tbody.selectAll('tr').data([...crosstabData.entries()].sort((a,b) => a[0] - b[0])).enter().append('tr');
    rows.append('td').text(d => d[0]);
    rows.selectAll('.data-cell').data(d => { const rowData = d[1]; return colCategories.map(colCat => rowData.get(colCat) || 0); }).enter().append('td').attr('class', 'data-cell').text(d => d);
}
function runSpectralClustering() {
    const dataForClustering = processedData;
    fetch('http://127.0.0.1:5000/api/cluster/spectral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: dataForClustering, n_clusters: d3.select('#n-clusters-input').property('value') })
    })
    .then(response => response.json())
    .then(result => {
        if (result.error) {
            alert("スペクトラルクラスタリングの実行中にエラーが発生しました。");
        } else {
            fullData.forEach(row => {
                row['Spectral_Cluster'] = result[row['品番']];
            });
            createScaleSpecificationUI(Object.keys(fullData[0]));
            updateAnalyses();
            alert("Spectral Clusteringが完了しました。");
        }
    })
    .catch(error => console.error('Fetch Error:', error));
}
function clearAnalyses() {
    d3.select('#table-container').select('table').remove();
    d3.select('#histogram-container').select('svg').remove();
    d3.select('#crosstab-container').select('table').remove();
    d3.select('#table-container').append('p').text('変数の尺度を指定して「反映」ボタンを押してください。').style('text-align', 'center').style('margin-top', '50px');
}

// テーブルフィルター関連関数
function setupTableFilter(data) {
    const selector = d3.select('#filter-column-selector');
    selector.html('');
    if (data.length > 0) {
        const columns = Object.keys(data[0]);
        selector.selectAll('option').data(columns).enter().append('option').text(d => d);
    }
}
function applyTableFilter() {
    const column = d3.select('#filter-column-selector').property('value');
    const value = d3.select('#filter-value-input').property('value');
    if (!column || value === '') {
        resetTableFilter();
        return;
    }
    const filtered = currentTableData.filter(row => row[column] == value);
    createTable(filtered);
}
function resetTableFilter() {
    d3.select('#filter-value-input').property('value', '');
    createTable(currentTableData);
}

// ★★★ ここからが新しく追加された関数 ★★★

function deselectAll() {
    fullData.forEach(row => row['選択'] = 0);
    currentTableData.forEach(row => row['選択'] = 0);
    // 現在表示されているフィルターを維持したままテーブルを再描画
    applyTableFilter();
}

function saveSelection() {
    // 「選択」が1の行だけを抽出
    const selectedData = fullData.filter(row => row['選択'] == 1);
    
    if (selectedData.length === 0) {
        alert("保存対象として選択されている行がありません。");
        return;
    }

    // D3のCSVフォーマッタを使用
    const csvContent = d3.csvFormat(selectedData);
    
    // Blobを作成してダウンロードリンクを生成
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "selected_products.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}