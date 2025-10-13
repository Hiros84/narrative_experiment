from PIL import Image
import os

# 入出力ディレクトリを指定
input_dir = "./images/original"
output_dir = "./images"
target_size = (100, 100)  # 幅×高さ

os.makedirs(output_dir, exist_ok=True)

for filename in os.listdir(input_dir):
    if filename.lower().endswith(".png"):
        filepath = os.path.join(input_dir, filename)
        with Image.open(filepath) as img:
            resized_img = img.resize(target_size, Image.Resampling.LANCZOS)
            output_path = os.path.join(output_dir, filename)
            resized_img.save(output_path)
            print(f"{filename} → リサイズして保存: {output_path}")