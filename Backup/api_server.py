import os
import numpy as np
import pandas as pd
import traceback
from flask import Flask, jsonify, Response, request
from flask_cors import CORS
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.manifold import TSNE
from scipy.cluster.hierarchy import linkage, to_tree
from sklearn.cluster import SpectralClustering

app = Flask(__name__)
CORS(app)

script_dir = os.path.dirname(__file__)
csv_dir = os.path.join(script_dir, '..', 'data', 'csv')

# (既存の /api/csv_files, /api/raw_data, /api/data のAPIは変更なし)
@app.route('/api/csv_files')
def get_csv_files():
    try:
        files = [f for f in os.listdir(csv_dir) if f.endswith('.csv') and os.path.isfile(os.path.join(csv_dir, f))]
        return jsonify(files)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/raw_data')
def get_raw_data():
    try:
        file_name = request.args.get('file')
        target_path = os.path.join(csv_dir, file_name)
        if not os.path.abspath(target_path).startswith(os.path.abspath(csv_dir)): return jsonify({"error": "Invalid file path"}), 400
        df = pd.read_csv(target_path)
        df = df.replace({np.nan: None})
        return Response(df.to_json(orient='records', indent=2, force_ascii=False), mimetype='application/json')
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/data')
def get_tsne_data():
    # ... (この部分は元のまま)
    try:
        fixed_file_path = os.path.join(csv_dir, 'TestData001.csv')
        df = pd.read_csv(fixed_file_path)
        identifier_cols, categorical_cols, numerical_cols = ['品番', '名前', '写真'], ['ブランド名', 'チャネル', '年度', 'シーズン', 'ステップ', 'ワイヤー', 'タイプ', 'シーン1', 'シーン2', 'シルエット', '着用感'], ['月', '補整力', '上代', '売上']
        df['月'] = pd.to_datetime(df['会期月'], format='%Y年%m月').dt.month
        for col in numerical_cols: df[col] = df[col].fillna(df[col].mean())
        for col in categorical_cols: df[col] = df[col].fillna('missing')
        preprocessor = ColumnTransformer(transformers=[('num', StandardScaler(), numerical_cols),('cat', OneHotEncoder(handle_unknown='ignore'), categorical_cols)])
        processed_data = preprocessor.fit_transform(df)
        tsne = TSNE(n_components=2, random_state=42, perplexity=min(30, len(df) - 1), max_iter=1000).fit_transform(processed_data)
        result_df = df[identifier_cols].copy()
        result_df['tsne_x'], result_df['tsne_y'] = tsne[:, 0], tsne[:, 1]
        return Response(result_df.to_json(orient='records', indent=2, force_ascii=False), mimetype='application/json')
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- ★★★ ここからが修正対象のAPI ★★★ ---

def convert_tree_to_json(node):
    if node.is_leaf():
        return {"name": str(node.id)}
    else:
        return {"name": f"node_{node.id}", "children": [convert_tree_to_json(node.get_left()), convert_tree_to_json(node.get_right())]}

@app.route('/api/cluster/hierarchical', methods=['POST'])
def run_hierarchical_clustering():
    try:
        data = request.json['data']
        df = pd.DataFrame(data)
        
        # 識別子のリストを定義
        identifier_cols = ['品番', '名前', '写真']
        # 存在する識別子列のみを抽出
        existing_identifiers = [col for col in identifier_cols if col in df.columns]

        # ラベル用の品番を先に抽出
        labels = df['品番'].tolist() if '品番' in df.columns else [f"item_{i}" for i in range(len(df))]
        
        # 分析用の数値データを作成（識別子列を削除）
        numeric_df = df.drop(columns=existing_identifiers)
        
        linked = linkage(numeric_df.values, method='ward')
        tree = to_tree(linked)
        d3_tree = convert_tree_to_json(tree)
        
        return jsonify({"tree": d3_tree, "labels": labels})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": "Clustering failed", "details": str(e)}), 500

@app.route('/api/cluster/spectral', methods=['POST'])
def run_spectral_clustering():
    try:
        data = request.json['data']
        df = pd.DataFrame(data)

        identifier_cols = ['品番', '名前', '写真']
        existing_identifiers = [col for col in identifier_cols if col in df.columns]

        品番_col = df['品番'] if '品番' in df.columns else pd.Series([f"item_{i}" for i in range(len(df))])
        numeric_df = df.drop(columns=existing_identifiers)

        n_clusters = min(5, len(df))
        model = SpectralClustering(n_clusters=n_clusters, assign_labels='kmeans', random_state=42)
        clusters = model.fit_predict(numeric_df.values)
        
        result = dict(zip(品番_col, clusters.tolist()))
        return jsonify(result)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": "Clustering failed", "details": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)