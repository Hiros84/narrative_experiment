import os
import pandas as pd
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.metrics import pairwise_distances

# --- 設定項目 ---
CSV_FILE_PATH = os.path.join('data', 'csv', 'TestData001.csv')
OUTPUT_CSV_PATH = os.path.join('data', 'high_dimensional_distances.csv')

def main():
    """メイン処理"""
    # 1. データの読み込み
    try:
        df = pd.read_csv(CSV_FILE_PATH)
        print("CSVファイルを読み込みました。")
    except FileNotFoundError:
        print(f"エラー: CSVファイルが見つかりません: {CSV_FILE_PATH}")
        return

    # 2. api_server.pyと同様の前処理を実行
    print("データの前処理を開始します...")
    categorical_cols = ['ブランド名', 'チャネル', '年度', 'シーズン', 'ステップ', 'ワイヤー', 'タイプ', 'シーン1', 'シーン2', 'シルエット', '着用感']
    df['月'] = pd.to_datetime(df['会期月'], format='%Y年%m月').dt.month
    numerical_cols = ['月', '補整力', '上代', '売上']

    # 欠損値の処理
    for col in numerical_cols:
        if df[col].isnull().any():
            df[col] = df[col].fillna(df[col].mean())
    for col in categorical_cols:
        if df[col].isnull().any():
            df[col] = df[col].fillna('missing')

    # パイプラインの作成と実行
    preprocessor = ColumnTransformer(
        transformers=[
            ('num', StandardScaler(), numerical_cols),
            ('cat', OneHotEncoder(handle_unknown='ignore'), categorical_cols)
        ])
    processed_data = preprocessor.fit_transform(df)
    print("データの前処理が完了しました。")
    print(f"処理後のデータ次元数: {processed_data.shape[1]}")

    # 3. 高次元空間でのユークリッド距離行列を計算
    print("高次元空間での距離行列を計算しています...")
    # 'euclidean'はユークリッド距離を指定
    distance_matrix = pairwise_distances(processed_data, metric='euclidean')
    print("距離行列の計算が完了しました。")
    print(f"行列の形状: {distance_matrix.shape}") # (データ数 x データ数) の正方行列になる

    # 4. 結果をDataFrameに変換し、CSVとして保存
    print(f"結果を {OUTPUT_CSV_PATH} に保存しています...")
    # 行と列のインデックスに商品の品番を設定
    distance_df = pd.DataFrame(distance_matrix, index=df['品番'], columns=df['品番'])
    distance_df.to_csv(OUTPUT_CSV_PATH)
    
    print("\n処理が完了しました。")
    print(f"最初の5x5の距離行列:\n{distance_df.iloc[:5, :5]}")


if __name__ == '__main__':
    main()