import os
import pandas as pd
import json

# --- 設定項目 ---
# 読み込む類似度行列のファイルパス
INPUT_MATRIX_PATH = os.path.join('data', 'top_10_percent_similarity_matrix.csv')

# 出力するJSONファイルのパス
OUTPUT_JSON_PATH = os.path.join('data', 'similarity_network.json')

# linkを生成するための類似度のしきい値
LINK_THRESHOLD = 0.001

def main():
    """メイン処理"""
    # 1. 類似度行列を読み込み
    try:
        similarity_df = pd.read_csv(INPUT_MATRIX_PATH, index_col=0)
        print(f"類似度行列を読み込みました。品番数: {len(similarity_df)}")
    except FileNotFoundError:
        print(f"エラー: 類似度行列ファイルが見つかりません: {INPUT_MATRIX_PATH}")
        return

    # 2. ノードリストを作成
    nodes = []
    品番_list = similarity_df.index.tolist()
    for 品番 in 品番_list:
        nodes.append({
            "id": 品番,
            "icon": f"images/{品番}.jpg"
        })
    print(f"{len(nodes)}件のノードを作成しました。")

    # 3. リンクリストを作成
    links = []
    # 重複ペアと自己参照を避けるため、行列の上三角部分のみをループ
    for i in range(len(品番_list)):
        for j in range(i + 1, len(品番_list)):
            source_品番 = 品番_list[i]
            target_品番 = 品番_list[j]
            
            # 類似度を取得
            value = similarity_df.loc[source_品番, target_品番]
            
            # しきい値を超えている場合のみリンクを追加
            if value >= LINK_THRESHOLD:
                links.append({
                    "source": source_品番,
                    "target": target_品番,
                    "value": value
                })
    print(f"{len(links)}件のリンクを作成しました。（しきい値 > {LINK_THRESHOLD}）")

    # 4. 最終的なJSON構造を作成
    network_data = {
        "nodes": nodes,
        "links": links
    }

    # 5. JSONファイルとして保存
    with open(OUTPUT_JSON_PATH, 'w', encoding='utf-8') as f:
        # indent=2 で見やすい形式で出力
        # ensure_ascii=False で日本語の文字化けを防ぐ
        json.dump(network_data, f, ensure_ascii=False, indent=2)

    print(f"\n処理が完了しました。{OUTPUT_JSON_PATH} にJSONファイルを保存しました。")

if __name__ == '__main__':
    main()