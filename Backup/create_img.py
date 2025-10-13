import os
import csv
from PIL import Image, ImageDraw, ImageFont

def generate_images_from_csv(base_directory):
    """
    CSVファイルから情報を読み取り、テキスト入りの画像を生成する関数。
    """
    # --- 基本設定 ---
    csv_filename = 'create_img_list.csv'
    output_folder_name = 'create_img'
    
    img_width, img_height = 700, 700
    bg_color = 'white'
    text_color = 'black'
    
    font_size_1 = 72
    font_size_2 = 36
    
    y_pos_1 = 230
    y_pos_2 = 460

    # --- フォントファイルのパス設定 ---
    # OSによってフォントの場所が異なります。
    # 以下は一般的なパスの例です。ご自身の環境に合わせて変更してください。
    # 実行して文字化けする場合やフォントが見つからないエラーが出る場合は、
    # 有効な日本語フォントの .ttf または .otf ファイルのパスを指定してください。
    font_path = None
    if os.path.exists('/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc'): # macOS
        font_path = '/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc'
    elif os.path.exists('C:/Windows/Fonts/meiryo.ttc'): # Windows
        font_path = 'C:/Windows/Fonts/meiryo.ttc'
    else:
        # 上記で見つからない場合は、手動でパスを指定してください
        # 例: font_path = '/Users/yourname/Library/Fonts/YourFont.ttf'
        print("警告: 標準の日本語フォントが見つかりません。文字化けする可能性があります。")

    # CSVファイルと出力ディレクトリのパスを組み立て
    csv_path = os.path.join(base_directory, csv_filename)
    output_dir = os.path.join(base_directory, output_folder_name)

    # --- パスの存在チェック ---
    if not os.path.exists(csv_path):
        print(f"エラー: CSVファイルが見つかりません: {csv_path}")
        return
        
    if not font_path:
        print("エラー: フォントファイルが見つかりません。コード内の font_path を設定してください。")
        return

    # 出力用ディレクトリがなければ作成
    os.makedirs(output_dir, exist_ok=True)
    print(f"画像の保存先: {output_dir}")

    # フォントをロード
    try:
        font1 = ImageFont.truetype(font_path, font_size_1)
        font2 = ImageFont.truetype(font_path, font_size_2)
    except IOError:
        print(f"エラー: 指定されたフォントファイルを読み込めません: {font_path}")
        return

    # --- CSVファイルを読み込んで画像生成 ---
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            # ヘッダー行をスキップ (ヘッダーがある場合)
            # next(reader, None) 
            
            for i, row in enumerate(reader):
                if not row or len(row) < 2:
                    print(f"警告: {i+1}行目はデータが不足しているためスキップします。")
                    continue
                
                text1 = row[0].strip()
                text2 = row[1].strip()

                # (1) 真っ白な画像を生成
                image = Image.new('RGB', (img_width, img_height), color=bg_color)
                draw = ImageDraw.Draw(image)

                # (2) テキストを描画 (中央揃え)
                # 1行目のテキスト
                bbox1 = draw.textbbox((0, 0), text1, font=font1)
                text1_width = bbox1[2] - bbox1[0]
                x_pos_1 = (img_width - text1_width) / 2
                draw.text((x_pos_1, y_pos_1), text1, font=font1, fill=text_color)
                
                # 2行目のテキスト
                bbox2 = draw.textbbox((0, 0), text2, font=font2)
                text2_width = bbox2[2] - bbox2[0]
                x_pos_2 = (img_width - text2_width) / 2
                draw.text((x_pos_2, y_pos_2), text2, font=font2, fill=text_color)

                # (3) ファイルを保存
                output_filename = f"{text1}.jpg"
                save_path = os.path.join(output_dir, output_filename)
                image.save(save_path, 'jpeg')
                print(f"✔️  画像を生成しました: {output_filename}")

    except FileNotFoundError:
        print(f"エラー: CSVファイルが見つかりません: {csv_path}")
    except Exception as e:
        print(f"予期せぬエラーが発生しました: {e}")

    print("\n全ての処理が完了しました。")


# --- メインの実行部分 ---
if __name__ == '__main__':
    # 💥 ここにCSVファイルが存在するディレクトリパスを指定してください
    target_base_dir = "/Users/imaihiroshi/Documents/WORK/GoldFragLtd/Data/data20250922/img"
    
    generate_images_from_csv(target_base_dir)