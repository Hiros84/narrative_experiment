import os
import pandas as pd
import numpy as np # Numpyをインポート
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.metrics import pairwise_distances
from sklearn.manifold._t_sne import _joint_probabilities
from scipy.spatial.distance import squareform
import matplotlib.pyplot as plt # Matplotlibをインポート
import seaborn as sns # Seabornをインポート

# --- 設定項目 ---
CSV_FILE_PATH = os.path.join('data', 'csv', 'TestData001.csv')
OUTPUT_CSV_PATH = os.path.join('data', 'final_similarity_matrix.csv')
# ★★★ ヒストグラム画像の保存先 ★★★
OUTPUT_HISTOGRAM_PATH = 'similarity_histogram.png'
PERPLEXITY = 30

def main():
    """メイン処理"""
    try:
        df = pd.read_csv(CSV_FILE_PATH)
    except FileNotFoundError:
        print(f"エラー: CSVファイルが見つかりません: {CSV_FILE_PATH}")
        return

    print("データの前処理を開始します...")
    # (前処理部分は変更なし)
    categorical_cols = ['ブランド名', 'チャネル', '年度', 'シーズン', 'ステップ', 'ワイヤー', 'タイプ', 'シーン1', 'シーン2', 'シルエット', '着用感']
    df['月'] = pd.to_datetime(df['会期月'], format='%Y年%m月').dt.month
    numerical_cols = ['月', '補整力', '上代', '売上']

    for col in numerical_cols:
        if df[col].isnull().any():
            df[col] = df[col].fillna(df[col].mean())
    for col in categorical_cols:
        if df[col].isnull().any():
            df[col] = df[col].fillna('missing')

    preprocessor = ColumnTransformer(
        transformers=[
            ('num', StandardScaler(), numerical_cols),
            ('cat', OneHotEncoder(handle_unknown='ignore'), categorical_cols)
        ])
    processed_data = preprocessor.fit_transform(df)
    print("データの前処理が完了しました。")

    print("高次元空間での距離を計算しています...")
    distances_squared = pairwise_distances(processed_data, metric='sqeuclidean')

    print(f"Perplexity={PERPLEXITY} を用いて類似度行列を計算しています...")
    similarity_matrix_1d = _joint_probabilities(
        distances_squared, desired_perplexity=PERPLEXITY, verbose=False
    )
    
    print("1次元配列を2次元の正方行列に復元しています...")
    similarity_matrix_2d = squareform(similarity_matrix_1d)
    
    print("類似度行列の計算が完了しました。")

    print(f"結果を {OUTPUT_CSV_PATH} に保存しています...")
    similarity_df = pd.DataFrame(similarity_matrix_2d, index=df['品番'], columns=df['品番'])
    similarity_df.to_csv(OUTPUT_CSV_PATH)
    
    print("\n処理が完了しました。")
    print(f"最初の5x5の類似度行列:\n{similarity_df.iloc[:5, :5]}")
    
    # --- ★★★ ここからがヒストグラム作成処理 ★★★ ---
    print(f"\n類似度データのヒストグラムを {OUTPUT_HISTOGRAM_PATH} に作成しています...")
    
    # 1. 対角成分(常に0)と重複を除外するため、行列の上三角部分のみを抽出
    upper_triangle_indices = np.triu_indices_from(similarity_matrix_2d, k=1)
    similarity_values = similarity_matrix_2d[upper_triangle_indices]
    
    # 2. 描画設定
    plt.figure(figsize=(12, 7))
    sns.set_style("whitegrid")
    
    # 3. ヒストグラムを描画 (kde=Trueで密度曲線も描画)
    sns.histplot(similarity_values, bins=100, kde=True)
    
    # 4. タイトルとラベルを設定
    plt.title('Similarity Values Distribution (Histogram)', fontsize=16)
    plt.xlabel('Similarity (Probability)', fontsize=12)
    plt.ylabel('Frequency (Count)', fontsize=12)
    
    # 5. 画像として保存
    plt.savefig(OUTPUT_HISTOGRAM_PATH)
    
    print("ヒストグラムの作成が完了しました。")


if __name__ == '__main__':
    main()