import os
import pandas as pd
from PIL import Image, ImageDraw, ImageFont

# --- 設定項目 ---
# 1. CSVファイルのパス
# このスクリプト(create_images.py)から見た相対パス
CSV_FILE_PATH = os.path.join('data', 'csv', 'TestData001.csv')

# 2. 画像の保存先フォルダ
OUTPUT_IMG_DIR = os.path.join('data', 'img')

# 3. 生成する画像のサイズ
IMG_WIDTH = 100
IMG_HEIGHT = 100

# 4. フォントの設定
try:
    # Hiragino Sans GB W3フォントのフルパスを指定
    font_path = '/System/Library/Fonts/Hiragino Sans GB.ttc'
    font = ImageFont.truetype(font_path, 10)
except IOError:
    print("指定されたフォントが見つかりません。デフォルトフォントを使用します。")
    font = ImageFont.load_default()

def create_text_image(text, output_path):
    """指定されたテキストを含む画像を生成して保存する関数"""
    # 1. 真っ白な画像を新規作成
    image = Image.new('RGB', (IMG_WIDTH, IMG_HEIGHT), 'white')
    draw = ImageDraw.Draw(image)

    # 2. テキストを描画
    # テキストが中央に来るように位置を調整
    draw.multiline_text(
        (10, 40),  # テキストを描画開始する左上の座標
        text,
        font=font,
        fill='black', # 文字色
        align='center'
    )

    # 3. 画像を保存
    image.save(output_path)

def main():
    """メイン処理"""
    # 1. 保存先フォルダがなければ作成
    if not os.path.exists(OUTPUT_IMG_DIR):
        os.makedirs(OUTPUT_IMG_DIR)
        print(f"フォルダを作成しました: {OUTPUT_IMG_DIR}")

    # 2. CSVファイルを読み込み
    try:
        df = pd.read_csv(CSV_FILE_PATH)
    except FileNotFoundError:
        print(f"エラー: CSVファイルが見つかりません: {CSV_FILE_PATH}")
        return

    print(f"CSVファイルを読み込みました。合計 {len(df)} 件のデータを処理します。")

    # 3. 1行ずつループして画像を作成
    for index, row in df.iterrows():
        # '写真'列と'名前'列から値を取得
        image_filename = row['写真']
        product_name = row['名前']
        
        # 保存する画像のフルパスを作成
        output_path = os.path.join(OUTPUT_IMG_DIR, image_filename)
        
        # 画像に描画するテキストを作成（ファイル名 + 改行 + 名前）
        text_to_draw = f"{image_filename}\n{product_name}"
        
        # 画像を生成
        create_text_image(text_to_draw, output_path)
        
        # 進捗を表示
        print(f"  {index + 1}/{len(df)}: {output_path} を作成しました。")

    print("\nすべての画像の生成が完了しました。")

if __name__ == '__main__':
    main()