##
# データハンドリング用

import numpy as np
import pandas as pd
import os as os

#現在のディレクトリ(Current Directory)の確認
os.getcwd()

#2つのファイルの読み込み
df_all = pd.read_csv('../data/csv/Data_20251014.csv')

# %%　データファイルの読み込み
df = pd.read_csv('../data/csv/Data_20251020-NonWire_with_Rank.csv')

# %%　数値の場合の基本集計
df.describe()
# %% ランクの出現率
df['商品ランク'].value_counts().sort_index()
# %%　変数名のリストを取り出す
list(df.columns)
# %% クロス集計表を作成する
cate_A = sorted(df['商品ランク'].dropna().unique())
cate_B = sorted(df['売上規模'].dropna().unique())
df['商品ランク']=df['商品ランク'].astype(
    pd.CategoricalDtype(categories=cate_A,ordered=True)
)
df['売上規模']=df['売上規模'].astype(
    pd.CategoricalDtype(categories=cate_B,ordered=True)
)

pd.crosstab(df['商品ランク'],df['売上規模'],dropna=False)
# %%
df['商品ランク']=df['商品ランク'].astype(pd.CategoricalDtype)
# %%]
df.pivot_table(index='商品ランク',columns='売上規模',aggfunc='size',fill_value=0)
# %%
df.columns[1]
# %%
