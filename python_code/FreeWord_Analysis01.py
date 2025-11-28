# ==========================================
# 品番ごとTXT + 対応表CSV → BERT埋め込み比較
# ==========================================
import os, glob, re
import numpy as np
import pandas as pd
os.environ["TOKENIZERS_PARALLELISM"] = "false"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"

# ★★ ここを環境に合わせて設定 ★★
REVIEWS_DIR = "../data/reviews"  # 例: /mnt/data/reviews に  A001.txt, MG125201.txt ... が入っている
META_CSV    = "../data/csv/フリーワード分析テキスト対応表.csv"  # 例: 品番,売上規模

# 依存の確認（未インストールなら: pip install -U sentence-transformers）
from sentence_transformers import SentenceTransformer
from scipy.spatial.distance import cosine

def read_txt_as_single_doc(path: str) -> str:
    # 改行区切りレビューを1文書にまとめる（空行除去・スペース正規化）
    with open(path, encoding="utf-8") as f:
        txt = f.read()
    lines = [ln.strip() for ln in txt.splitlines() if ln.strip()]
    doc = "。".join(lines)
    # 連続空白を1つに
    doc = re.sub(r"\s+", " ", doc)
    return doc

# -------------------------
# 1) 対応表読み込み
# -------------------------
meta = pd.read_csv(META_CSV)
if not set(["品番","売上規模"]).issubset(meta.columns):
    raise ValueError("対応表CSVに「品番」「売上規模」列が必要です。列名を確認してください。")

# 売上規模は「大」/ それ以外（小 など）で2群比較
meta = meta.astype({"品番": str, "売上規模": str})

# -------------------------
# 2) レビューTXTを集約
# -------------------------
records = []
txt_files = sorted(glob.glob(os.path.join(REVIEWS_DIR, "*.txt")))
if not txt_files:
    raise FileNotFoundError(f"{REVIEWS_DIR} に .txt が見つかりません。パスを確認してください。")

for fp in txt_files:
    pid = os.path.splitext(os.path.basename(fp))[0]  # 例: MG125201
    doc = read_txt_as_single_doc(fp)

    # 対応表から売上規模を取得（見つからなければ「不明」）
    row = meta.loc[meta["品番"] == pid]
    scale = row["売上規模"].iloc[0] if len(row) else "不明"

    records.append({"品番": pid, "売上規模": scale, "レビュー": doc})

df = pd.DataFrame(records).sort_values("品番").reset_index(drop=True)

print("✅ 読み込み結果（先頭）：")
print(df.head())
missing = (df["売上規模"] == "不明").sum()
if missing:
    print(f"⚠️ 対応表に存在しない品番が {missing} 件あります（「不明」扱い）。CSVの品番とTXTファイル名の一致を確認してください。")

# -------------------------
# 3) BERT埋め込み
# -------------------------
# 日本語Sentence-BERT（平均プーリング済み）モデル
model = SentenceTransformer("sonoisa/sentence-bert-base-ja-mean-tokens")
emb = model.encode(df["レビュー"].tolist(), convert_to_tensor=False)  # shape: [N, D]
emb = np.asarray(emb)

# -------------------------
# 4) 2群（large=1,2 vs small=0）の平均ベクトル距離
# -------------------------
df["売上規模"] = pd.to_numeric(df["売上規模"], errors="coerce")
mask_large = df["売上規模"].isin([1, 2])
mask_small = (df["売上規模"] == 0) & (df["売上規模"] != "不明")

if mask_large.sum() == 0 or mask_small.sum() == 0:
    print("⚠️ large群またはsmall群のデータが不足しています。対応表を確認してください。")
else:
    mean_large = emb[mask_large].mean(axis=0)
    mean_small = emb[mask_small].mean(axis=0)
    dist = cosine(mean_large, mean_small)
    print(f"\n📐 平均ベクトル間コサイン距離（large[1,2] vs small[0]）: {dist:.4f}")

# -------------------------
# 5) 参考：結果を保存（任意）
# -------------------------
# 各品番の埋め込みをCSVに落とす（次の分析に便利）
EMB_CSV = "../data/csv/review_embeddings.csv"
emb_df = pd.DataFrame(emb)
out = pd.concat([df[["品番","売上規模"]].reset_index(drop=True), emb_df], axis=1)
out.to_csv(EMB_CSV, index=False, encoding="utf-8")
print(f"💾 埋め込みCSVを保存: {EMB_CSV}")

# -------------------------
# 6) （任意）上位/下位の近傾向サンプル確認
# -------------------------
# 品番ごとの「大」平均に対するコサイン距離→小さいほど『大』寄りの言語傾向
if mask_large.sum() and mask_small.sum():
    from numpy.linalg import norm
    def cos_dist(a,b): return 1 - np.dot(a,b)/(norm(a)*norm(b) + 1e-12)
    dists_to_large_mean = [cos_dist(v, mean_large) for v in emb]
    df["大平均からの距離"] = dists_to_large_mean
    top_like_large = df.sort_values("大平均からの距離").head(5)[["品番","売上規模","大平均からの距離"]]
    print("\n🔎 『大』平均に言語的に近い上位サンプル（距離が小）:")
    print(top_like_large.to_string(index=False))

# -------------------------
# 7) 売上規模別の特徴語抽出（単語頻度差分析）
# -------------------------
from janome.tokenizer import Tokenizer
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.feature_selection import chi2
import matplotlib.pyplot as plt

# 形態素解析で名詞・形容詞・動詞など主要語を抽出
tokenizer = Tokenizer()

def tokenize(text):
    tokens = [t.base_form for t in tokenizer.tokenize(text)
              if t.part_of_speech.startswith(("名詞", "形容詞", "動詞"))]
    return tokens

# 「大（1,2）」群と「小（0）」群に分ける
df["group"] = np.where(df["売上規模"].isin([1, 2]), "large", "small")

# CountVectorizerでBoW化（単語カウント）
vectorizer = CountVectorizer(tokenizer=tokenize, max_features=2000)
X = vectorizer.fit_transform(df["レビュー"])
y = df["group"]

# カイ二乗検定で各単語の偏りを計算
chi2_scores, p_values = chi2(X, y == "large")
vocab = np.array(vectorizer.get_feature_names_out())

# 「large」側で特徴的な単語TOP20
top_large = vocab[np.argsort(chi2_scores)[-20:][::-1]]
print("\n🔍 『大』群に特徴的な単語TOP20:")
print(top_large)

# 「small」側で特徴的な単語TOP20
top_small = vocab[np.argsort(chi2_scores)[:20]]

print("\n🔍 『小』群に特徴的な単語TOP20:")
print(top_small)

# -------------------------
# 8) 文脈レベル分析（BERT文埋め込みによる特徴文抽出）
# -------------------------
import nltk
nltk.download('punkt')
from nltk.tokenize import sent_tokenize
from sklearn.metrics.pairwise import cosine_similarity

# 日本語文分割（簡易版）
def split_sentences_japanese(text):
    sents = re.split(r"[。！？]\s*", text)
    return [s for s in sents if len(s.strip()) > 0]

# 文単位のデータセット構築
sentence_records = []
for i, row in df.iterrows():
    sents = split_sentences_japanese(row["レビュー"])
    for s in sents:
        sentence_records.append({
            "品番": row["品番"],
            "売上規模": row["売上規模"],
            "group": "large" if row["売上規模"] in [1,2] else "small",
            "文": s
        })

df_sent = pd.DataFrame(sentence_records)

# 文埋め込み生成
print("🔄 文単位のBERT埋め込みを生成中...")
sent_emb = model.encode(df_sent["文"].tolist(), convert_to_tensor=False)

# 各群の平均ベクトル
emb_large = np.mean([v for v, g in zip(sent_emb, df_sent["group"]) if g == "large"], axis=0)
emb_small = np.mean([v for v, g in zip(sent_emb, df_sent["group"]) if g == "small"], axis=0)

from scipy.spatial.distance import cosine
dist_sent = cosine(emb_large, emb_small)
print(f"\n📏 文脈レベルの平均ベクトル距離（large vs small）: {dist_sent:.4f}")

# 各文とlarge平均ベクトルとの距離
dist_to_large = [cosine(v, emb_large) for v in sent_emb]
df_sent["距離_to_large"] = dist_to_large

# large寄り文TOP10とsmall寄り文TOP10
print("\n🔍 『大』群に意味的に近い文TOP10:")
print(df_sent.sort_values("距離_to_large").head(10)[["group","文","距離_to_large"]].to_string(index=False))


print("\n🔍 『小』群に意味的に遠い文TOP10:")
print(df_sent.sort_values("距離_to_large", ascending=False).head(10)[["group","文","距離_to_large"]].to_string(index=False))

# -------------------------
# 9) グループ固有の文抽出（large専用文／small専用文）
# -------------------------

# 「large（1,2）」群と「small（0）」群で出現する文の差を抽出
print("\n🧩 グループ固有の文抽出を実行中...")

# 文ごとに完全一致で比較
large_texts = set(df_sent[df_sent["group"] == "large"]["文"])
small_texts = set(df_sent[df_sent["group"] == "small"]["文"])

# それぞれのみに含まれる文を抽出
unique_large = large_texts - small_texts
unique_small = small_texts - large_texts

print(f"\n📘 『大（1,2）』群のみに出現する文数: {len(unique_large)}")
print(f"📕 『小（0）』群のみに出現する文数: {len(unique_small)}")

# サンプル表示（上位10件）
print("\n🔹 『大（1,2）』群のみに出現する文サンプル（最大10件）:")
for s in list(unique_large)[:10]:
    print(" -", s)

print("\n🔸 『小（0）』群のみに出現する文サンプル（最大10件）:")
for s in list(unique_small)[:10]:
    print(" -", s)

# ---------------------------------------
# 出力をファイルとして保存（すべての固有文）
# ---------------------------------------
output_dir = "../data/output"
os.makedirs(output_dir, exist_ok=True)

large_path = os.path.join(output_dir, "unique_large_sentences.txt")
small_path = os.path.join(output_dir, "unique_small_sentences.txt")

with open(large_path, "w", encoding="utf-8") as f:
    f.write("\n".join(sorted(unique_large)))

with open(small_path, "w", encoding="utf-8") as f:
    f.write("\n".join(sorted(unique_small)))

print("\n💾 固有文をファイルに保存しました:")
print(f" - 大（1,2）群: {large_path}")
print(f" - 小（0）群:   {small_path}")

# -------------------------
# 10) 意味クラスタリングによる代表文抽出
# -------------------------
from sklearn.cluster import KMeans
from sentence_transformers import SentenceTransformer
import numpy as np

def cluster_sentences(sentences, model, n_clusters=10):
    if len(sentences) == 0:
        return []
    n_clusters = min(n_clusters, len(sentences))  # 文数が少ない場合は自動調整
    embeddings = model.encode(sentences, convert_to_tensor=False)
    # Reduce n_init for memory usage
    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=1)
    labels = kmeans.fit_predict(embeddings)
    centers = kmeans.cluster_centers_

    representative_sentences = []
    for i in range(n_clusters):
        cluster_idx = np.where(labels == i)[0]
        cluster_vectors = np.array(embeddings)[cluster_idx]
        dists = np.linalg.norm(cluster_vectors - centers[i], axis=1)
        closest = cluster_idx[np.argmin(dists)]
        representative_sentences.append(sentences[closest])
    return representative_sentences

print("\n🧠 クラスタリングによる代表文抽出を実行中...")

# Use cpu device for stability
model = SentenceTransformer("sonoisa/sentence-bert-base-ja-mean-tokens", device="cpu")

large_path = "../data/output/unique_large_sentences.txt"
small_path = "../data/output/unique_small_sentences.txt"

with open(large_path, encoding="utf-8") as f:
    large_sents = [l.strip() for l in f if l.strip()]
with open(small_path, encoding="utf-8") as f:
    small_sents = [l.strip() for l in f if l.strip()]

# Limit the number of sentences per group for stability
MAX_SENT = 600
if len(large_sents) > MAX_SENT:
    print(f"⚠️ large群の文数が多いため先頭{MAX_SENT}件に制限します。")
    large_sents = large_sents[:MAX_SENT]
if len(small_sents) > MAX_SENT:
    print(f"⚠️ small群の文数が多いため先頭{MAX_SENT}件に制限します。")
    small_sents = small_sents[:MAX_SENT]

print(f"🌀 large群クラスタリング: 文数={len(large_sents)}")
large_summary = cluster_sentences(large_sents, model)
print(f"🌀 small群クラスタリング: 文数={len(small_sents)}")
small_summary = cluster_sentences(small_sents, model)

output_dir = "../data/output"
os.makedirs(output_dir, exist_ok=True)

clustered_large_path = os.path.join(output_dir, "clustered_large_sentences.txt")
clustered_small_path = os.path.join(output_dir, "clustered_small_sentences.txt")

with open(clustered_large_path, "w", encoding="utf-8") as f:
    f.write("\n".join(large_summary))

with open(clustered_small_path, "w", encoding="utf-8") as f:
    f.write("\n".join(small_summary))

print("\n💾 クラスタ代表文を保存しました:")
print(f" - 大（1,2）群代表文: {clustered_large_path}")
print(f" - 小（0）群代表文:   {clustered_small_path}")

# -------------------------
# 11) t-SNEネットワーク図（代表文の構造可視化）
# -------------------------
from sklearn.manifold import TSNE
from sklearn.metrics.pairwise import cosine_similarity
import matplotlib.pyplot as plt

def tsne_network(sentences, group_name, out_prefix, model, top_k=3):
    """
    sentences: 代表文のリスト（例：10文）
    group_name: "large" or "small" など表示用
    out_prefix: 出力ファイルの接頭辞（拡張子なし）
    model: SentenceTransformer モデル（既に読み込み済み）
    top_k: 各ノードから接続する近傍数
    """
    if len(sentences) == 0:
        print(f"⚠️ {group_name}: 文が空のためスキップします。")
        return

    # 1) 埋め込み生成
    print(f"💬 {group_name}: 埋め込み生成 ({len(sentences)} 文) ...")
    embs = model.encode(sentences, convert_to_tensor=False)

    # 2) 類似度と近傍エッジ
    S = cosine_similarity(embs)  # NxN
    # 3) t-SNE（少数文に安全なパラメータ）
    #    perplexity は N より小さくする必要があるため、2〜5の範囲で自動調整
    perpl = min(5, max(2, len(sentences)//3 if len(sentences)//3 >= 2 else 2))
    try:
        tsne = TSNE(n_components=2, random_state=42, init="random",
                    perplexity=perpl, learning_rate="auto", n_iter=1000, verbose=0)
        X2 = tsne.fit_transform(embs)  # (N,2)
    except TypeError:
        tsne = TSNE(n_components=2, random_state=42, init="random",
                    perplexity=perpl, learning_rate="auto", max_iter=1000, verbose=0)
        X2 = tsne.fit_transform(embs)  # (N,2)

    # 4) エッジ集合（重複を避ける）
    edges = set()
    for i in range(len(sentences)):
        order = np.argsort(-S[i])  # 類似度降順
        cnt = 0
        for j in order:
            if j == i:
                continue
            edges.add(tuple(sorted((i, j))))
            cnt += 1
            if cnt >= min(top_k, len(sentences) - 1):
                break

    # 5) 図を描く
    plt.figure(figsize=(6, 5))
    # 線（エッジ）
    for (i, j) in edges:
        plt.plot([X2[i, 0], X2[j, 0]],
                 [X2[i, 1], X2[j, 1]],
                 linewidth=0.8, alpha=0.5)
    # 点（ノード）
    plt.scatter(X2[:, 0], X2[:, 1])
    # ラベル（ノード番号）
    for i, _ in enumerate(sentences):
        plt.text(X2[i, 0], X2[i, 1], str(i+1), fontsize=9,
                 ha="center", va="center")
    plt.title(f"t-SNE network ({group_name})")
    plt.tight_layout()

    # 6) 保存
    out_png = f"{out_prefix}.png"
    plt.savefig(out_png, dpi=200)
    plt.close()

    # 7) インデックス→文の対応表も保存（TSV）
    map_path = f"{out_prefix}_index2sentence.tsv"
    with open(map_path, "w", encoding="utf-8") as f:
        for i, s in enumerate(sentences):
            f.write(f"{i+1}\t{s}\n")

    print(f"🖼 画像を保存: {out_png}")
    print(f"🗺 対応表を保存: {map_path}")

# 出力先の準備とファイル読み込み
tsne_out_dir = "../data/output"
os.makedirs(tsne_out_dir, exist_ok=True)

# Section 10 で作った出力パスを再利用（変数が無ければ再定義）
clustered_large_path = os.path.join(tsne_out_dir, "clustered_large_sentences.txt")
clustered_small_path = os.path.join(tsne_out_dir, "clustered_small_sentences.txt")

# 代表文の読み込み
if os.path.exists(clustered_large_path):
    with open(clustered_large_path, encoding="utf-8") as f:
        rep_large = [l.strip() for l in f if l.strip()]
else:
    rep_large = []
if os.path.exists(clustered_small_path):
    with open(clustered_small_path, encoding="utf-8") as f:
        rep_small = [l.strip() for l in f if l.strip()]
else:
    rep_small = []

# t-SNEネットワーク作成（large / small それぞれ）
large_prefix = os.path.join(tsne_out_dir, "tsne_large_network")
small_prefix = os.path.join(tsne_out_dir, "tsne_small_network")

print("\n🎯 t-SNEネットワーク可視化を開始します...")
tsne_network(rep_large, "large", large_prefix, model, top_k=3)
tsne_network(rep_small, "small", small_prefix, model, top_k=3)
print("✅ t-SNEネットワークの作成が完了しました。")

# -------------------------
# 12) 感覚語仮説の検証
# -------------------------
from scipy.stats import ttest_ind
from sentence_transformers import util

print("\n🔍 感覚語仮説の検証を開始します...")

# 感覚語リスト
hold_words = ["ホールド感", "安定感", "支えられる", "包まれる", "安心感"]
tight_words = ["きつい", "締め付け", "窮屈", "圧迫"]
loose_words = ["ゆるい", "ズレる", "緩め", "フィットしない"]

def count_sense_words(text, word_list):
    return sum(text.count(w) for w in word_list)

# 各レビュー内の出現数をカウント
df["hold_count"] = df["レビュー"].apply(lambda x: count_sense_words(str(x), hold_words))
df["tight_count"] = df["レビュー"].apply(lambda x: count_sense_words(str(x), tight_words))
df["loose_count"] = df["レビュー"].apply(lambda x: count_sense_words(str(x), loose_words))

# 集計
sense_summary = df.groupby("売上規模")[["hold_count", "tight_count", "loose_count"]].mean()
print("\n📊 感覚語出現数の平均（売上規模別）:")
print(sense_summary)

# 統計検定（large vs small）
large_mask = df["売上規模"].isin([1, 2])
small_mask = df["売上規模"] == 0

results = []
for cat in ["hold_count", "tight_count", "loose_count"]:
    t, p = ttest_ind(df.loc[large_mask, cat], df.loc[small_mask, cat], equal_var=False)
    results.append((cat, t, p))
    print(f"{cat}: t={t:.2f}, p={p:.4f}")

# 文脈類似度による補足分析
print("\n🧠 文脈類似度による検証...")
hold_vec = model.encode(hold_words)
tight_vec = model.encode(tight_words)
loose_vec = model.encode(loose_words)

df["hold_sim"] = [util.cos_sim(model.encode([txt]), hold_vec).max().item() for txt in df["レビュー"]]
df["tight_sim"] = [util.cos_sim(model.encode([txt]), tight_vec).max().item() for txt in df["レビュー"]]
df["loose_sim"] = [util.cos_sim(model.encode([txt]), loose_vec).max().item() for txt in df["レビュー"]]

context_summary = df.groupby("売上規模")[["hold_sim","tight_sim","loose_sim"]].mean()
print("\n📏 文脈類似度の平均（売上規模別）:")
print(context_summary)

# 出力保存
output_path = "../data/output/sense_hypothesis_results.txt"
with open(output_path, "w", encoding="utf-8") as f:
    f.write("=== 感覚語仮説の検証結果 ===\n\n")
    f.write("📊 出現回数平均（売上規模別）:\n")
    f.write(str(sense_summary))
    f.write("\n\n📈 t検定結果:\n")
    for cat, t, p in results:
        f.write(f"{cat}: t={t:.2f}, p={p:.4f}\n")
    f.write("\n📏 文脈類似度平均（売上規模別）:\n")
    f.write(str(context_summary))
print(f"\n💾 結果を保存しました: {output_path}")
#
# 13) 発見・満足ナラティブの検証
# -------------------------
print("\n🔍 発見・満足ナラティブの検証を開始します...")
from scipy.stats import ttest_ind
from sentence_transformers import util

# 1. discovery_phrases（例：「意外に良かった」「探していた」「出会えて」「リピート」「また買いたい」など）を定義
discovery_phrases = [
    "意外に良かった", "意外によかった", "探していた", "出会えて", "出会えた", "リピート", "また買いたい", "また購入", "満足", "発見", "思ったより良い", "思ったよりよい",
    "またリピート", "また買います", "また利用", "また使いたい", "再購入", "良い発見", "新しい発見", "買ってよかった", "嬉しい", "良かった", "よかった", "満足しています", "満足している"
]

# 2. 各レビューで出現回数をカウントし、新しい列 `discovery_count` を追加
def count_discovery_phrases(text, phrases):
    return sum(text.count(p) for p in phrases)
df["discovery_count"] = df["レビュー"].apply(lambda x: count_discovery_phrases(str(x), discovery_phrases))

# 3. 売上規模別に平均を出力
discovery_summary = df.groupby("売上規模")["discovery_count"].mean()
print("\n📊 発見・満足表現の出現数平均（売上規模別）:")
print(discovery_summary)

# 4. t検定で統計的有意差を検証
large_mask = df["売上規模"].isin([1, 2])
small_mask = df["売上規模"] == 0
if large_mask.sum() > 0 and small_mask.sum() > 0:
    t_disc, p_disc = ttest_ind(df.loc[large_mask, "discovery_count"], df.loc[small_mask, "discovery_count"], equal_var=False)
    print(f"discovery_count: t={t_disc:.2f}, p={p_disc:.4f}")
else:
    t_disc, p_disc = None, None
    print("⚠️ t検定を実施できるデータが不足しています。")

# 5. Sentence-BERTによる文脈類似度を計算（seed_phrases群との最大コサイン類似度）
print("\n🧠 文脈類似度による検証（発見・満足ナラティブ）...")
seed_vec = model.encode(discovery_phrases)
df["discovery_sim"] = [util.cos_sim(model.encode([txt]), seed_vec).max().item() for txt in df["レビュー"]]

# 6. 売上規模別の平均類似度を出力
discovery_sim_summary = df.groupby("売上規模")["discovery_sim"].mean()
print("\n📏 発見・満足表現の文脈類似度平均（売上規模別）:")
print(discovery_sim_summary)

# 7. すべての結果を "../data/output/discovery_expression_results.txt" に保存
output_path_disc = "../data/output/discovery_expression_results.txt"
with open(output_path_disc, "w", encoding="utf-8") as f:
    f.write("=== 発見・満足ナラティブの検証結果 ===\n\n")
    f.write("📊 出現回数平均（売上規模別）:\n")
    f.write(str(discovery_summary))
    f.write("\n\n📈 t検定結果:\n")
    if t_disc is not None:
        f.write(f"discovery_count: t={t_disc:.2f}, p={p_disc:.4f}\n")
    else:
        f.write("t検定を実施できるデータが不足しています。\n")
    f.write("\n📏 文脈類似度平均（売上規模別）:\n")
    f.write(str(discovery_sim_summary))
print(f"\n💾 発見・満足ナラティブの検証結果を保存しました: {output_path_disc}")