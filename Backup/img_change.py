import os
import csv
from PIL import Image

def process_images_in_directory(directory_path):
    """
    指定されたディレクトリ内の画像を処理する関数。
    (1) PNGをJPGに変換
    (2) 全ての画像を770x770pxにリサイズ
    結果を同ディレクトリのresult.csvに出力する。
    """
    # 結果を保存するCSVファイルのパス
    csv_path = os.path.join(directory_path, 'result.csv')
    
    # 処理結果を格納するリスト
    results = []
    
    # 指定されたディレクトリが存在するか確認
    if not os.path.isdir(directory_path):
        print(f"エラー: ディレクトリ '{directory_path}' が見つかりません。")
        return

    print(f"処理を開始します。対象ディレクトリ: {directory_path}")

    # ディレクトリ内の全てのファイルをループ
    for filename in os.listdir(directory_path):
        # ファイルのフルパスを作成
        file_path = os.path.join(directory_path, filename)

        # ファイルでない場合（ディレクトリなど）はスキップ
        if not os.path.isfile(file_path):
            continue

        # 小文字のファイル名で拡張子を判定
        lower_filename = filename.lower()
        
        # 画像ファイル（PNG, JPG, JPEG）以外はスキップ
        if not (lower_filename.endswith('.png') or lower_filename.endswith('.jpg') or lower_filename.endswith('.jpeg')):
            continue

        status = 0  # 0: 失敗, 1: 成功
        output_filename = filename
        final_size = 'N/A'

        try:
            # 画像を開く
            with Image.open(file_path) as img:
                processed_img = img
                
                # (1) PNG画像の場合、JPGに変換
                if lower_filename.endswith('.png'):
                    # 新しいファイル名 (例: image.png -> image.jpg)
                    base_name = os.path.splitext(filename)[0]
                    output_filename = f"{base_name}.jpg"
                    
                    # PNGが透過情報(A)を持つ場合、JPG保存のためにRGBに変換
                    if processed_img.mode == 'RGBA':
                        processed_img = processed_img.convert('RGB')
                
                # (2) 画像を770x770にリサイズ
                # 高品質なリサイズのために Image.Resampling.LANCZOS を使用
                resized_img = processed_img.resize((770, 770), Image.Resampling.LANCZOS)
                
                # 新しい保存パスを決定
                save_path = os.path.join(directory_path, output_filename)
                
                # 画像を保存（JPG形式で品質95を指定）
                resized_img.save(save_path, 'jpeg', quality=95)
                
                final_size = '770x770'
                status = 1
                print(f"✔️  処理成功: {filename} -> {output_filename}")

            # PNGからJPGへの変換が成功した場合、元のPNGファイルを削除
            if lower_filename.endswith('.png') and status == 1:
                os.remove(file_path)
                print(f"🗑️  元ファイル削除: {filename}")

        except Exception as e:
            # 処理中にエラーが発生した場合
            status = 0
            final_size = 'N/A'
            print(f"❌ 処理失敗: {filename} (エラー: {e})")
        
        # 結果をリストに追加
        results.append([output_filename, final_size, status])

    # --- CSVファイルへの書き出し ---
    try:
        with open(csv_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            # ヘッダーを書き込む
            writer.writerow(['file_name', 'size', 'status'])
            # 結果を書き込む
            writer.writerows(results)
        print(f"\n結果を {csv_path} に書き出しました。")
    except Exception as e:
        print(f"\nCSVファイルへの書き込みに失敗しました: {e}")
        
    print("全ての処理が完了しました。")


# --- メインの実行部分 ---
if __name__ == '__main__':
    # 💥 ここに対象のディレクトリパスを正確に指定してください
    target_directory = "/Users/imaihiroshi/Documents/WORK/GoldFragLtd/Data/data20250922/img"
    
    process_images_in_directory(target_directory)