import os
import pandas as pd
import numpy as np

# --- 設定項目 ---
# 読み込む類似度行列のファイルパス
INPUT_MATRIX_PATH = os.path.join('data', 'final_similarity_matrix.csv')

# 出力する新しい行列のファイルパス
OUTPUT_MATRIX_PATH = os.path.join('data', 'top_10_percent_similarity_matrix.csv')

# 類似度の閾値（上位10%なので0.9を指定）
QUANTILE_THRESHOLD = 0.999

def main():
    """メイン処理"""
    # 1. 類似度行列を読み込み
    try:
        similarity_df = pd.read_csv(INPUT_MATRIX_PATH, index_col=0)
        print(f"類似度行列を読み込みました。元の品番数: {len(similarity_df)}")
    except FileNotFoundError:
        print(f"エラー: 類似度行列ファイルが見つかりません: {INPUT_MATRIX_PATH}")
        return

    # 2. 上位10%のしきい値を計算
    # 行列の上三角部分（対角線を除く）の値のみを取得して計算
    upper_triangle_indices = np.triu_indices_from(similarity_df.values, k=1)
    similarity_values = similarity_df.values[upper_triangle_indices]
    
    threshold_value = np.quantile(similarity_values, QUANTILE_THRESHOLD)
    print(f"類似度の上位10%に入るためのしきい値: {threshold_value:.6f}")

    # 3. しきい値を超える類似度を持つ品番をリストアップ
    # 自分自身との比較（対角線）は除外する
    
    # まず、しきい値以上のペアを抽出
    high_similarity_pairs = similarity_df[similarity_df >= threshold_value]
    
    # 品番を格納するためのセット（重複を自動で除く）
    品番_to_keep = set()

    # 行と列をループして、しきい値以上の値を持つ品番をセットに追加
    for 品番_row in high_similarity_pairs.index:
        for 品番_col in high_similarity_pairs.columns:
            # NaNでなく、かつ対角線でない場合
            if pd.notna(high_similarity_pairs.loc[品番_row, 品番_col]) and 品番_row != 品番_col:
                品番_to_keep.add(品番_row)
                品番_to_keep.add(品番_col)
    
    # セットをリストに変換してソート
    品番_to_keep = sorted(list(品番_to_keep))
    print(f"しきい値以上の類似度を持つ品番の数: {len(品番_to_keep)}")

    # 4. 抽出された品番で、新しい類似度行列を作成
    filtered_similarity_df = similarity_df.loc[品番_to_keep, 品番_to_keep]

    # 5. 新しい行列をCSVとして保存
    print(f"新しい類似度行列を {OUTPUT_MATRIX_PATH} に保存しています...")
    filtered_similarity_df.to_csv(OUTPUT_MATRIX_PATH)

    print("\n処理が完了しました。")
    print(f"作成された行列のサイズ: {filtered_similarity_df.shape[0]} x {filtered_similarity_df.shape[1]}")

if __name__ == '__main__':
    main()